package com.stockcard.service.liquidity.qe;

import com.stockcard.service.liquidity.ThresholdRule;
import com.stockcard.service.liquidity.ThresholdRule.Direction;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.TreeMap;

import static org.assertj.core.api.Assertions.assertThat;

class QeStageEngineTest {

    private static final LocalDate T = LocalDate.of(2026, 11, 18);

    private static Map<String, ThresholdRule> rules() {
        Map<String, ThresholdRule> m = new HashMap<>();
        put(m, "SOMA_13W", 25, 150);
        put(m, "SOMA_LONG_13W", 25, 100);
        put(m, "QE_OPS_28D", 10, 40);
        put(m, "PRIMARY_CREDIT_4W", 10, 50);
        put(m, "CB_SWAPS_4W", 10, 50);
        put(m, "NONSEC_4W", 25, 100);
        put(m, "SRF_AMT", 1, 25);
        return m;
    }

    private static void put(Map<String, ThresholdRule> m, String code, double yellow, double red) {
        m.put(code, new ThresholdRule(code, Direction.HIGHER_IS_WORSE, yellow, red, true));
    }

    /** A builder for the engine inputs; every series defaults to empty. */
    private static class In {
        final TreeMap<LocalDate, Double> soma13 = new TreeMap<>(), long13 = new TreeMap<>(), ops = new TreeMap<>(),
                credit = new TreeMap<>(), swaps = new TreeMap<>(), nonsec = new TreeMap<>(), srf = new TreeMap<>();

        In soma13(double v) { soma13.put(T, v); return this; }
        In long13(double v) { long13.put(T, v); return this; }
        In ops(double v) { ops.put(T, v); return this; }
        In credit(LocalDate d, double v) { credit.put(d, v); return this; }
        In srf(String date, double v) { srf.put(LocalDate.parse(date), v); return this; }

        QeStageEngine.StageResult at(LocalDate t, Map<String, ThresholdRule> rules) {
            return QeStageEngine.evaluate(new QeStageEngine.Inputs(soma13, long13, ops, credit, swaps, nonsec, srf), t, rules);
        }

        QeStageEngine.StageResult now() {
            return at(T, rules());
        }
    }

    @Test
    void eachRungHasAPositiveCase() {
        assertThat(new In().soma13(212.4).ops(45).now().level()).isEqualTo(4);
        assertThat(new In().long13(120).soma13(120).now().level()).isEqualTo(4);
        assertThat(new In().credit(T.minusDays(3), 80).soma13(0).now().level()).isEqualTo(3);
        assertThat(new In().soma13(30).now().level()).isEqualTo(2);
        assertThat(new In().soma13(-30).now().level()).isEqualTo(0);
        QeStageEngine.StageResult neutral = new In().soma13(-3.9).now();
        assertThat(neutral.level()).isEqualTo(1);
        assertThat(neutral.triggers()).singleElement().asString().contains("-3.9").contains("-25").contains("25");
    }

    @Test
    void qeNeedsNetGrowthOfTheBalanceSheetNotJustPurchases() {
        // MBS paydowns reinvested every month: large operations, but SOMA_13W is flat -> not QE
        assertThat(new In().soma13(0).ops(60).now().level()).isEqualTo(1);
        // purchases and growth together
        assertThat(new In().soma13(30).ops(60).now().level()).isEqualTo(4);
    }

    @Test
    void higherRungsWinWhenSeveralConditionsHold() {
        In in = new In().soma13(212.4).ops(45).credit(T, 80);
        assertThat(in.now().level()).isEqualTo(4);
        assertThat(new In().soma13(40).credit(T, 80).now().level()).isEqualTo(3); // L3 before L2
    }

    @Test
    void emergencyLendingCountsFor20DaysAndThenTheStageFallsBack() {
        In in = new In().soma13(0).credit(T.minusDays(20), 80);
        assertThat(in.now().level()).isEqualTo(3);
        assertThat(new In().soma13(0).credit(T.minusDays(21), 80).now().level()).isEqualTo(1);
    }

    @Test
    void srfNeedsTwoDaysAndIgnoresTheYearsBefore2009() {
        assertThat(new In().soma13(0).srf("2026-11-17", 30).now().level()).isEqualTo(1);
        assertThat(new In().soma13(0).srf("2026-11-17", 30).srf("2026-11-18", 26).now().level()).isEqualTo(3);
        assertThat(new In().soma13(0).srf("2026-11-17", 20).srf("2026-11-18", 26).now().level()).isEqualTo(1);

        LocalDate day = LocalDate.of(2008, 3, 12);
        In routine = new In();
        routine.soma13.put(day, 0.0);
        routine.srf.put(day.minusDays(1), 50.0);
        routine.srf.put(day, 60.0);
        assertThat(routine.at(day, rules()).level()).isEqualTo(1);
    }

    @Test
    void theStageFollowsTheThresholdsThatAreCurrentlyConfigured() {
        Map<String, ThresholdRule> stricter = rules();
        put(stricter, "SOMA_13W", 50, 150);

        assertThat(new In().soma13(30).at(T, rules()).level()).isEqualTo(2);
        assertThat(new In().soma13(30).at(T, stricter).level()).isEqualTo(1);
        assertThat(new In().soma13(212.4).ops(45).at(T, new HashMap<>()).level()).isEqualTo(1); // no rules at all: nothing can trigger
    }

    @Test
    void withoutSomaDataTheStageIsNeutralAndSaysWhy() {
        QeStageEngine.StageResult r = new In().now();

        assertThat(r.level()).isEqualTo(1);
        assertThat(r.triggers()).singleElement().asString().contains("缺少 SOMA");
    }
}
