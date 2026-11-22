package com.stockcard.service.liquidity.qe;

import com.stockcard.service.liquidity.LiquidityStatus;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** How likely the Fed is to move up the ladder, from the pressure and intent indicators (qe-radar §3.6, §3.7). Pure. */
public final class QeLikelihood {

    public enum Level { LOW, MEDIUM, HIGH }

    /** One indicator's latest state. {@code NONE} (no data, no key, disabled) is never counted. */
    public record Signal(String code, boolean pressure, LiquidityStatus status, String reason) {
        boolean red() {
            return status == LiquidityStatus.RED;
        }

        boolean yellowOrWorse() {
            return status == LiquidityStatus.YELLOW || status == LiquidityStatus.RED;
        }
    }

    public record Result(Level level, List<String> reasons) {}

    private QeLikelihood() {}

    public static Result assess(List<Signal> signals, boolean fredMissing) {
        long pressureRed = count(signals, true, true);
        long pressureYellow = count(signals, true, false);
        long intentRed = count(signals, false, true);
        long intentYellow = count(signals, false, false);
        boolean textRed = signals.stream().anyMatch(s -> s.code().equals("TEXT_SIGNAL") && s.red());

        Level level;
        if (pressureRed >= 2 || (pressureRed >= 1 && intentRed >= 1) || textRed) level = Level.HIGH;
        else if (pressureRed >= 1 || pressureYellow >= 3 || intentRed >= 1 || intentYellow >= 2) level = Level.MEDIUM;
        else level = Level.LOW;

        List<String> reasons = new ArrayList<>();
        signals.stream().filter(Signal::yellowOrWorse).forEach(s -> reasons.add(s.reason()));
        if (fredMissing) reasons.add("缺少 FRED 数据，部分指标未计入");
        return new Result(level, reasons);
    }

    /** Counts the indicators at red, or at yellow-or-worse, in one layer. */
    private static long count(List<Signal> signals, boolean pressure, boolean redOnly) {
        return signals.stream().filter(s -> s.pressure() == pressure).filter(redOnly ? Signal::red : Signal::yellowOrWorse).count();
    }

    /** Heuristic hints for the next rung; several can apply at once. */
    public static List<String> nextSteps(int stageLevel, Map<String, LiquidityStatus> statuses, List<Signal> signals) {
        List<String> out = new ArrayList<>();
        if (stageLevel <= 2 && anyAtLeastYellow(statuses, "SOFR_IORB", "SOFR99_IORB", "LIQ_RATIO")) {
            out.add("L2：加大短债购买（技术性补准备金）");
        }
        if (anyRed(statuses, "STLFSI4", "VIX", "HY_OAS")) {
            out.add("L3：启用紧急工具（SRF / 贴现窗口 / 互换）");
        }
        boolean pressureRed = signals.stream().anyMatch(s -> s.pressure() && s.red());
        if (statuses.get("FFTR_HIGH") == LiquidityStatus.RED && (pressureRed || statuses.get("SAHM") == LiquidityStatus.RED)) {
            out.add("L4：QE（利率空间耗尽）");
        }
        if (out.isEmpty()) out.add("维持现状");
        return out;
    }

    private static boolean anyAtLeastYellow(Map<String, LiquidityStatus> statuses, String... codes) {
        for (String c : codes) {
            LiquidityStatus s = statuses.get(c);
            if (s == LiquidityStatus.YELLOW || s == LiquidityStatus.RED) return true;
        }
        return false;
    }

    private static boolean anyRed(Map<String, LiquidityStatus> statuses, String... codes) {
        for (String c : codes) {
            if (statuses.get(c) == LiquidityStatus.RED) return true;
        }
        return false;
    }
}
