package com.stockcard.service.liquidity.qe;

import com.stockcard.repository.FedTextEventRepository;
import com.stockcard.service.liquidity.LiquidityStatus;
import com.stockcard.service.liquidity.qe.QeLikelihood.Level;
import com.stockcard.service.liquidity.qe.QeLikelihood.Signal;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static com.stockcard.service.liquidity.LiquidityStatus.GREEN;
import static com.stockcard.service.liquidity.LiquidityStatus.NONE;
import static com.stockcard.service.liquidity.LiquidityStatus.RED;
import static com.stockcard.service.liquidity.LiquidityStatus.YELLOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class QeLikelihoodTest {

    private static Signal p(String code, LiquidityStatus s) {
        return new Signal(code, true, s, code + "（" + s + "）");
    }

    private static Signal i(String code, LiquidityStatus s) {
        return new Signal(code, false, s, code + "（" + s + "）");
    }

    @Test
    void highNeedsTwoPressureRedsOrPressureAndIntentTogetherOrARedTextSignal() {
        assertThat(QeLikelihood.assess(List.of(p("A", RED), p("B", RED)), false).level()).isEqualTo(Level.HIGH);
        assertThat(QeLikelihood.assess(List.of(p("A", RED), i("CUT_PRICING", RED)), false).level()).isEqualTo(Level.HIGH);
        assertThat(QeLikelihood.assess(List.of(i("TEXT_SIGNAL", RED)), false).level()).isEqualTo(Level.HIGH);
    }

    @Test
    void mediumBranches() {
        assertThat(QeLikelihood.assess(List.of(p("A", RED)), false).level()).isEqualTo(Level.MEDIUM);
        assertThat(QeLikelihood.assess(List.of(p("A", YELLOW), p("B", YELLOW), p("C", YELLOW)), false)
                .level()).isEqualTo(Level.MEDIUM); // three yellows in the pressure layer
        assertThat(QeLikelihood.assess(List.of(i("CUT_PRICING", RED)), false).level()).isEqualTo(Level.MEDIUM);
        assertThat(QeLikelihood.assess(List.of(i("A", YELLOW), i("B", YELLOW)), false).level()).isEqualTo(Level.MEDIUM);
    }

    @Test
    void lowWhenNothingStandsOutAndNoneIsNeverCounted() {
        assertThat(QeLikelihood.assess(List.of(p("A", YELLOW), p("B", YELLOW), i("C", YELLOW)), false).level()).isEqualTo(Level.LOW);
        assertThat(QeLikelihood.assess(List.of(p("A", NONE), p("B", NONE), p("C", NONE), p("D", GREEN)), false).level()).isEqualTo(Level.LOW);
    }

    @Test
    void reasonsListTheYellowAndRedIndicatorsAndMentionAMissingFredKey() {
        QeLikelihood.Result r = QeLikelihood.assess(List.of(p("VIX", YELLOW), p("SOFR_IORB", RED), p("NFCI", GREEN)), true);

        assertThat(r.reasons()).containsExactly("VIX（YELLOW）", "SOFR_IORB（RED）", "缺少 FRED 数据，部分指标未计入");
    }

    @Test
    void nextStepHints() {
        Signal vixRed = p("VIX", RED);
        assertThat(QeLikelihood.nextSteps(1, Map.of("SOFR_IORB", RED), List.of())).containsExactly("L2：加大短债购买（技术性补准备金）");
        assertThat(QeLikelihood.nextSteps(3, Map.of("SOFR_IORB", RED), List.of())).containsExactly("维持现状"); // already above L2
        assertThat(QeLikelihood.nextSteps(1, Map.of("VIX", RED), List.of(vixRed))).containsExactly("L3：启用紧急工具（SRF / 贴现窗口 / 互换）");
        assertThat(QeLikelihood.nextSteps(1, Map.of("FFTR_HIGH", RED, "SAHM", RED), List.of()))
                .containsExactly("L4：QE（利率空间耗尽）");
        assertThat(QeLikelihood.nextSteps(1, Map.of("FFTR_HIGH", RED), List.of())).containsExactly("维持现状");
        assertThat(QeLikelihood.nextSteps(1, Map.of(), List.of())).containsExactly("维持现状");
    }

    // ---- the text signal ----

    private static FedTextEventRepository.Summary text(String date, String type, String categories) {
        FedTextEventRepository.Summary s = mock(FedTextEventRepository.Summary.class);
        when(s.getId()).thenReturn(1L);
        when(s.getDocDate()).thenReturn(LocalDate.parse(date));
        when(s.getDocType()).thenReturn(type);
        when(s.getCategories()).thenReturn(categories);
        when(s.getTitle()).thenReturn("t");
        return s;
    }

    @Test
    void theTextSignalLooksAtTheLast60DaysAndNeverAtMinutes() {
        LocalDate t = LocalDate.of(2026, 11, 22);
        List<FedTextEventRepository.Summary> texts = List.of(
                text("2026-11-18", "MINUTES", "QE_PURCHASE"),     // minutes only recap: ignored
                text("2026-10-28", "IMPL_NOTE", "RMP"),
                text("2026-09-01", "STATEMENT", "QE_PURCHASE"));  // 82 days ago: outside the window

        QeRadarService.TextSignal signal = QeRadarService.textSignal(texts, t);

        assertThat(signal.status()).isEqualTo(YELLOW);
        assertThat(signal.categories()).containsExactly("RMP");
        assertThat(QeRadarService.textSignal(List.of(texts.get(0)), t).status()).isEqualTo(NONE);
        assertThat(QeRadarService.textSignal(List.of(text("2026-11-01", "STATEMENT", "")), t).status()).isEqualTo(GREEN);
        assertThat(QeRadarService.textSignal(List.of(text("2026-11-01", "STATEMENT", "QE_PURCHASE,CUT")), t).status()).isEqualTo(RED);
        // evaluating a past week only sees the texts published by then
        assertThat(QeRadarService.textSignal(texts, LocalDate.of(2026, 10, 1)).status()).isEqualTo(RED);
    }

    @Test
    void anAnnouncedPurchaseProgrammeIsFlaggedFor45DaysAndEmergencyToolsFor14_withoutChangingTheLevel() {
        List<FedTextEventRepository.Summary> texts = List.of(
                text("2020-03-23", "STATEMENT", "QE_PURCHASE,EMERGENCY"));

        QeRadarService.Announced a = QeRadarService.announced(texts, LocalDate.of(2020, 4, 20), 2);
        assertThat(a.level()).isEqualTo(4);
        assertThat(a.docDate()).isEqualTo(LocalDate.of(2020, 3, 23));
        assertThat(QeRadarService.announced(texts, LocalDate.of(2020, 4, 20), 4)).isNull(); // the data has caught up
        assertThat(QeRadarService.announced(texts, LocalDate.of(2020, 5, 20), 2)).isNull(); // too old
        assertThat(QeRadarService.announced(List.of(text("2023-03-12", "OTHER", "EMERGENCY")), LocalDate.of(2023, 3, 20), 1).level()).isEqualTo(3);
        assertThat(QeRadarService.announced(List.of(text("2023-03-12", "OTHER", "EMERGENCY")), LocalDate.of(2023, 4, 20), 1)).isNull();
    }
}
