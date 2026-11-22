package com.stockcard.service.liquidity;

import com.stockcard.repository.LiquidityManualSeriesRepository;
import com.stockcard.repository.LiquidityThresholdRepository;
import com.stockcard.service.liquidity.ThresholdRule.Direction;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
class LiquidityThresholdServiceTest {

    @Autowired LiquidityThresholdRepository repo;
    @Autowired LiquidityManualSeriesRepository manualRepo;

    LiquidityThresholdService service;

    @BeforeEach
    void setUp() {
        service = new LiquidityThresholdService(repo, manualRepo);
    }

    @Test
    void fallsBackToTheCodeDefaultsWhenNothingIsSaved() {
        ThresholdRule rule = service.find("SOFR_IORB").orElseThrow();
        assertThat(rule.direction()).isEqualTo(Direction.HIGHER_IS_WORSE);
        assertThat(rule.yellow()).isEqualTo(-2);
        assertThat(rule.red()).isEqualTo(0);
        assertThat(rule.enabled()).isTrue();
        assertThat(service.find("FED_ASSETS")).isEmpty(); // observe only
        // the QE radar thresholds (qe-radar §3.5) come with the defaults, including the former observe-only HY_OAS
        assertThat(service.find("HY_OAS").orElseThrow().red()).isEqualTo(6.0);
        assertThat(service.find("SOMA_13W").orElseThrow().yellow()).isEqualTo(25);
        assertThat(service.list()).extracting(LiquidityThresholdService.ThresholdView::code)
                .contains("SOFR_IORB", "TGCR_IORB", "SOFR_EFFR", "SOFR99_IORB", "LIQ_RATIO", "SRF_AMT", "ONRRP_AMT");
    }

    @Test
    void savedValuesOverrideTheDefaultAndResetRestoresIt() {
        service.save("SOFR_IORB", Direction.HIGHER_IS_WORSE, -1, 1, false);

        ThresholdRule saved = service.find("SOFR_IORB").orElseThrow();
        assertThat(saved.yellow()).isEqualTo(-1);
        assertThat(saved.red()).isEqualTo(1);
        assertThat(saved.enabled()).isFalse();
        LiquidityThresholdService.ThresholdView view = service.list().stream().filter(v -> v.code().equals("SOFR_IORB")).findFirst().orElseThrow();
        assertThat(view.customized()).isTrue();
        assertThat(view.defaults().yellow()).isEqualTo(-2);

        service.reset("SOFR_IORB");
        assertThat(service.find("SOFR_IORB").orElseThrow().yellow()).isEqualTo(-2);
        assertThat(service.list().stream().filter(v -> v.code().equals("SOFR_IORB")).findFirst().orElseThrow().customized()).isFalse();
    }

    @Test
    void rejectsThresholdsThatContradictTheDirection() {
        assertThatThrownBy(() -> service.save("SOFR_IORB", Direction.HIGHER_IS_WORSE, 5, 0, true))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.save("LIQ_RATIO", Direction.LOWER_IS_WORSE, 10, 12, true))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.save("NOPE", Direction.HIGHER_IS_WORSE, 0, 1, true))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("NOPE");
    }

    @Test
    void higherIsWorseBoundariesAreInclusive() {
        ThresholdRule rule = new ThresholdRule("SOFR_IORB", Direction.HIGHER_IS_WORSE, -2, 0, true);
        assertThat(rule.evaluate(-2.01)).isEqualTo(LiquidityStatus.GREEN);
        assertThat(rule.evaluate(-2.0)).isEqualTo(LiquidityStatus.YELLOW);
        assertThat(rule.evaluate(-0.01)).isEqualTo(LiquidityStatus.YELLOW);
        assertThat(rule.evaluate(0.0)).isEqualTo(LiquidityStatus.RED);
        assertThat(rule.evaluate(5.0)).isEqualTo(LiquidityStatus.RED);
    }

    @Test
    void lowerIsWorseBoundariesAreInclusive() {
        ThresholdRule rule = new ThresholdRule("LIQ_RATIO", Direction.LOWER_IS_WORSE, 12.5, 11, true);
        assertThat(rule.evaluate(12.51)).isEqualTo(LiquidityStatus.GREEN);
        assertThat(rule.evaluate(12.5)).isEqualTo(LiquidityStatus.YELLOW);
        assertThat(rule.evaluate(11.01)).isEqualTo(LiquidityStatus.YELLOW);
        assertThat(rule.evaluate(11.0)).isEqualTo(LiquidityStatus.RED);
    }

    @Test
    void disabledRulesAndMissingValuesAreObserveOnly() {
        assertThat(new ThresholdRule("X", Direction.HIGHER_IS_WORSE, 0, 1, false).evaluate(9.0)).isEqualTo(LiquidityStatus.NONE);
        assertThat(new ThresholdRule("X", Direction.HIGHER_IS_WORSE, 0, 1, true).evaluate(null)).isEqualTo(LiquidityStatus.NONE);
    }
}
