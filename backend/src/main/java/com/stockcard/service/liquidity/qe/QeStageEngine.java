package com.stockcard.service.liquidity.qe;

import com.stockcard.service.liquidity.LiquidityStatus;
import com.stockcard.service.liquidity.SeriesPoint;
import com.stockcard.service.liquidity.ThresholdRule;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.TreeMap;

/**
 * Decides which rung of the Fed's easing ladder it is on from the balance-sheet data (qe-radar §3.4). Pure: all inputs are passed
 * in. "Red" and "yellow" are the effective thresholds of the series (so editing a threshold in the settings changes the stage).
 */
public final class QeStageEngine {

    public static final String[] NAMES = {"收水（QT）", "中性", "技术性扩表", "紧急注入", "QE"};

    /** SOMA_13W at or below this (bn) means the Fed is shrinking its holdings: L0. Not tunable in the settings. */
    static final double QT_THRESHOLD_BN = -25;
    /** Emergency tools usually run off within weeks; looking back 20 days keeps the stage from flipping every week. */
    static final int L3_LOOKBACK_DAYS = 20;
    /** One day of SRF use at quarter-end is not an emergency; two days within the window are. */
    static final int SRF_MIN_DAYS = 2;
    /** Before 2009 repos were a routine daily operation of tens of billions, not an emergency injection. */
    static final LocalDate SRF_FIRST_DATE = LocalDate.of(2009, 1, 1);

    public record StageResult(int level, LocalDate asOf, List<String> triggers, LocalDate since) {
        public String name() {
            return NAMES[level];
        }
    }

    /** The series the engine reads, keyed by date. */
    public record Inputs(NavigableMap<LocalDate, Double> soma13w, NavigableMap<LocalDate, Double> somaLong13w,
                         NavigableMap<LocalDate, Double> qeOps28d, NavigableMap<LocalDate, Double> primaryCredit4w,
                         NavigableMap<LocalDate, Double> cbSwaps4w, NavigableMap<LocalDate, Double> nonsec4w,
                         NavigableMap<LocalDate, Double> srf) {

        public static Inputs of(Map<String, List<SeriesPoint>> series) {
            return new Inputs(map(series, "SOMA_13W"), map(series, "SOMA_LONG_13W"), map(series, "QE_OPS_28D"),
                    map(series, "PRIMARY_CREDIT_4W"), map(series, "CB_SWAPS_4W"), map(series, "NONSEC_4W"), map(series, "SRF_AMT"));
        }

        private static NavigableMap<LocalDate, Double> map(Map<String, List<SeriesPoint>> series, String code) {
            TreeMap<LocalDate, Double> out = new TreeMap<>();
            series.getOrDefault(code, List.of()).forEach(p -> out.put(p.date(), p.value()));
            return out;
        }
    }

    private QeStageEngine() {}

    /** Checks L4, L3, L2, L0 in that order; the first rung whose condition holds is the stage, otherwise L1. */
    public static StageResult evaluate(Inputs in, LocalDate t, Map<String, ThresholdRule> rules) {
        Double soma13 = asOf(in.soma13w(), t);
        Double long13 = asOf(in.somaLong13w(), t);
        Double ops28 = asOf(in.qeOps28d(), t);

        // Net-based on purpose: the Fed reinvested MBS paydowns every month in 2014-2017 and again in Aug-Oct 2019. That is
        // not QE, and SOMA_13W (the net change of all holdings) is what keeps those periods out of L4.
        // SOMA_LONG_13W covers 2009-2014: MBS purchases then have no operation records (ambs only starts in 2018), only the weekly holdings.
        List<String> l4 = new ArrayList<>();
        if (ops28 != null && soma13 != null && isRed(rules, "QE_OPS_28D", ops28) && atLeastYellow(rules, "SOMA_13W", soma13)) {
            l4.add("近 28 天长债 + MBS 净购买 " + signed(ops28) + " bn ≥ " + num(red(rules, "QE_OPS_28D"))
                    + "，且 SOMA 13 周 " + signed(soma13) + " bn ≥ " + num(yellow(rules, "SOMA_13W")));
        }
        if (long13 != null && isRed(rules, "SOMA_LONG_13W", long13)) {
            l4.add("长债 + MBS 13 周 " + signed(long13) + " bn ≥ " + num(red(rules, "SOMA_LONG_13W")));
        }
        if (!l4.isEmpty()) return new StageResult(4, t, l4, null);

        List<String> l3 = emergencyTriggers(in, t, rules);
        if (!l3.isEmpty()) return new StageResult(3, t, l3, null);

        if (soma13 == null) return new StageResult(1, t, List.of("缺少 SOMA 数据，按中性处理"), null);
        if (atLeastYellow(rules, "SOMA_13W", soma13)) {
            return new StageResult(2, t, List.of("SOMA 13 周 " + signed(soma13) + " bn ≥ " + num(yellow(rules, "SOMA_13W"))), null);
        }
        if (soma13 <= QT_THRESHOLD_BN) {
            return new StageResult(0, t, List.of("SOMA 13 周 " + signed(soma13) + " bn ≤ " + num(QT_THRESHOLD_BN)), null);
        }
        return new StageResult(1, t, List.of("SOMA 13 周 " + signed(soma13) + " bn，介于 " + num(QT_THRESHOLD_BN)
                + " 与 " + num(yellow(rules, "SOMA_13W")) + " 之间"), null);
    }

    /** L3 triggers within [t − 20d, t]: any of the three 4-week jumps in the Fed's emergency lending at red, or SRF use on at least 2 days. */
    private static List<String> emergencyTriggers(Inputs in, LocalDate t, Map<String, ThresholdRule> rules) {
        LocalDate from = t.minusDays(L3_LOOKBACK_DAYS);
        List<String> out = new ArrayList<>();
        jump(out, "贴现窗口 4 周变化", in.primaryCredit4w(), "PRIMARY_CREDIT_4W", from, t, rules);
        jump(out, "央行互换 4 周变化", in.cbSwaps4w(), "CB_SWAPS_4W", from, t, rules);
        jump(out, "非证券资产 4 周变化", in.nonsec4w(), "NONSEC_4W", from, t, rules);

        ThresholdRule srfRule = rules.get("SRF_AMT");
        if (srfRule != null) {
            LocalDate start = from.isBefore(SRF_FIRST_DATE) ? SRF_FIRST_DATE : from;
            long days = start.isAfter(t) ? 0 : in.srf().subMap(start, true, t, true).values().stream()
                    .filter(v -> srfRule.evaluate(v) == LiquidityStatus.RED).count();
            if (days >= SRF_MIN_DAYS) out.add("近 " + L3_LOOKBACK_DAYS + " 天内有 " + days + " 天 SRF 用量 ≥ " + num(srfRule.red()) + " bn");
        }
        return out;
    }

    private static void jump(List<String> out, String label, NavigableMap<LocalDate, Double> series, String code,
                             LocalDate from, LocalDate to, Map<String, ThresholdRule> rules) {
        ThresholdRule rule = rules.get(code);
        if (rule == null || from.isAfter(to)) return;
        series.subMap(from, true, to, true).entrySet().stream()
                .filter(e -> rule.evaluate(e.getValue()) == LiquidityStatus.RED)
                .max(Map.Entry.comparingByValue())
                .ifPresent(e -> out.add(label + " " + signed(e.getValue()) + " bn ≥ " + num(rule.red()) + "（" + e.getKey() + "）"));
    }

    /** One result per evaluation date, in order. */
    public static List<StageResult> history(Inputs in, List<LocalDate> dates, Map<String, ThresholdRule> rules) {
        return dates.stream().map(d -> evaluate(in, d, rules)).toList();
    }

    // ---- helpers ----

    private static Double asOf(NavigableMap<LocalDate, Double> series, LocalDate date) {
        Map.Entry<LocalDate, Double> e = series.floorEntry(date);
        return e == null ? null : e.getValue();
    }

    private static boolean isRed(Map<String, ThresholdRule> rules, String code, double value) {
        ThresholdRule r = rules.get(code);
        return r != null && r.evaluate(value) == LiquidityStatus.RED;
    }

    private static boolean atLeastYellow(Map<String, ThresholdRule> rules, String code, double value) {
        ThresholdRule r = rules.get(code);
        if (r == null) return false;
        LiquidityStatus s = r.evaluate(value);
        return s == LiquidityStatus.YELLOW || s == LiquidityStatus.RED;
    }

    private static double red(Map<String, ThresholdRule> rules, String code) {
        ThresholdRule r = rules.get(code);
        return r == null ? Double.NaN : r.red();
    }

    private static double yellow(Map<String, ThresholdRule> rules, String code) {
        ThresholdRule r = rules.get(code);
        return r == null ? Double.NaN : r.yellow();
    }

    private static String signed(double v) {
        return String.format("%+.1f", v);
    }

    /** 25.0 -> "25", 1.5 -> "1.5"; "—" for a threshold that does not exist. */
    static String num(double v) {
        if (Double.isNaN(v)) return "—";
        return v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(v);
    }
}
