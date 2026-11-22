package com.stockcard.service.liquidity.qe;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockcard.repository.FedTextEventRepository;
import com.stockcard.repository.QeRadarAlertRepository;
import com.stockcard.service.AppConfigService;
import com.stockcard.service.liquidity.LiquidityCalcService;
import com.stockcard.service.liquidity.LiquidityStatus;
import com.stockcard.service.liquidity.LiquidityThresholdService;
import com.stockcard.service.liquidity.SeriesPoint;
import com.stockcard.service.liquidity.ThresholdRule;
import com.stockcard.service.liquidity.ThresholdRule.Direction;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class QeRadarServiceTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-22T10:00:00Z"), ZoneOffset.UTC);

    private final LiquidityCalcService calc = mock(LiquidityCalcService.class);
    private final LiquidityThresholdService thresholds = mock(LiquidityThresholdService.class);
    private final FedTextEventRepository textRepo = mock(FedTextEventRepository.class);
    private final QeRadarAlertRepository alertRepo = mock(QeRadarAlertRepository.class);
    private final AppConfigService config = mock(AppConfigService.class);
    private final Map<String, List<SeriesPoint>> series = new HashMap<>();

    private QeRadarService service() {
        Map<String, ThresholdRule> rules = new HashMap<>();
        rules.put("SOMA_13W", new ThresholdRule("SOMA_13W", Direction.HIGHER_IS_WORSE, 25, 150, true));
        rules.put("SOFR_IORB", new ThresholdRule("SOFR_IORB", Direction.HIGHER_IS_WORSE, -2, 0, true));
        rules.put("VIX", new ThresholdRule("VIX", Direction.HIGHER_IS_WORSE, 25, 35, true));
        rules.put("LIQ_RATIO", new ThresholdRule("LIQ_RATIO", Direction.LOWER_IS_WORSE, 12.5, 11, true));
        when(thresholds.effectiveRules()).thenReturn(rules);
        when(calc.getSeries(anySet(), any(), any())).thenReturn(series);
        when(config.resolveFredApiKey()).thenReturn("key");
        return new QeRadarService(calc, thresholds, textRepo, alertRepo, config, new ObjectMapper(), CLOCK);
    }

    private static List<SeriesPoint> pts(String d1, double v1, String d2, double v2) {
        return List.of(new SeriesPoint(LocalDate.parse(d1), v1), new SeriesPoint(LocalDate.parse(d2), v2));
    }

    @Test
    void theReservesRatioDoesNotCountBeforeTheAmpleReservesRegime() {
        series.put("LIQ_RATIO", pts("2017-05-31", 5, "2019-05-29", 5)); // red on the thresholds above
        QeRadarService service = service();

        assertThat(service.assessAt(LocalDate.of(2017, 6, 1)).likelihood().level()).isEqualTo(QeLikelihood.Level.LOW);
        assertThat(service.assessAt(LocalDate.of(2019, 6, 1)).likelihood().level()).isEqualTo(QeLikelihood.Level.MEDIUM);
    }

    @Test
    void currentReadingCombinesStageLikelihoodCardsAndTheStartOfTheStage() {
        series.put("SOMA_13W", List.of(new SeriesPoint(LocalDate.of(2026, 11, 4), -3.0), new SeriesPoint(LocalDate.of(2026, 11, 11), -3.5),
                new SeriesPoint(LocalDate.of(2026, 11, 18), -3.9)));
        series.put("SOFR_IORB", pts("2026-11-12", -1, "2026-11-19", 1));
        series.put("VIX", pts("2026-11-18", 27, "2026-11-19", 28.44));

        QeRadarService.RadarView view = service().current();

        assertThat(view.stage().level()).isEqualTo(1);
        assertThat(view.stage().name()).isEqualTo("中性");
        assertThat(view.stage().since()).isEqualTo(LocalDate.of(2026, 11, 4));
        assertThat(view.likelihood().level()).isEqualTo("MEDIUM");
        assertThat(view.likelihood().reasons()).anyMatch(r -> r.contains("VIX") && r.contains("黄"))
                .anyMatch(r -> r.contains("红"));
        assertThat(view.nextSteps()).containsExactly("L2：加大短债购买（技术性补准备金）");
        assertThat(view.asOf()).isEqualTo(LocalDate.of(2026, 11, 18));
        assertThat(view.fredConfigured()).isTrue();
        assertThat(view.layers().pressure()).extracting(c -> c.code()).contains("VIX", "SOFR_IORB");
        assertThat(view.layers().pressure().stream().filter(c -> c.code().equals("VIX")).findFirst().orElseThrow().status())
                .isEqualTo(LiquidityStatus.YELLOW);
        assertThat(view.layers().intent()).extracting(c -> c.code()).endsWith("TEXT_SIGNAL");
        assertThat(view.layers().action()).extracting(c -> c.code()).contains("SOMA_13W", "SRF_AMT");
    }

    @Test
    void withoutAFredKeyTheLikelihoodSaysSo() {
        when(config.resolveFredApiKey()).thenReturn("");
        QeRadarService service = service();
        when(config.resolveFredApiKey()).thenReturn("");

        assertThat(service.current().likelihood().reasons()).contains("缺少 FRED 数据，部分指标未计入");
    }

    @Test
    void anUnknownReplayEpisodeIs404() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service().replay("NOPE")).hasMessageContaining("404");
    }
}
