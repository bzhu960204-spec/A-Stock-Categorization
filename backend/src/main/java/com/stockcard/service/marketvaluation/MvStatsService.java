package com.stockcard.service.marketvaluation;

import com.stockcard.service.liquidity.SeriesPoint;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.TreeMap;

/** Historical percentiles, window statistics and the 0-100 valuation thermometer (design §3.4, §5.5). */
@Service
public class MvStatsService {

    public enum Window {
        Y10, Y20, SINCE_1990, ALL;

        /** The wire name used by the API and the UI: 10Y / 20Y / SINCE_1990 / ALL. */
        public String wire() {
            return switch (this) {
                case Y10 -> "10Y";
                case Y20 -> "20Y";
                default -> name();
            };
        }

        public static Window parse(String text) {
            if (text == null || text.isBlank()) return Y20;
            return switch (text.trim().toUpperCase(Locale.ROOT)) {
                case "10Y" -> Y10;
                case "20Y" -> Y20;
                case "SINCE_1990", "1990" -> SINCE_1990;
                case "ALL" -> ALL;
                default -> throw new IllegalArgumentException("window 必须是 10Y / 20Y / SINCE_1990 / ALL");
            };
        }

        /** First day of the window ending at {@code end}. */
        public LocalDate start(LocalDate end) {
            return switch (this) {
                case Y10 -> end.minusYears(10);
                case Y20 -> end.minusYears(20);
                case SINCE_1990 -> LocalDate.of(1990, 1, 1);
                case ALL -> LocalDate.of(1800, 1, 1);
            };
        }
    }

    public record Stats(int n, LocalDate sampleStart, double mean, double sd, double p10, double p50, double p90, double min, double max) {}

    /** Percentile of a current value inside a window; {@code enough} is false when the sample is too small to trust. */
    public record Percentile(Double percentile, LocalDate sampleStart, int n, boolean enough) {}

    /** The series whose history a value is ranked against, and the sample size below which the ranking is not meaningful. */
    public record Baseline(String code, boolean resampleMonthEnd, int minSamples) {}

    public record Component(String key, String name, String code, Double value, LocalDate date, Double percentile,
                            LocalDate sampleStart, int n, boolean excluded, String excludedReason) {}

    public record Temperature(Double value, String level, List<Component> components) {}

    static final int MIN_MONTHLY = 36;
    static final int MIN_QUARTERLY = 16;

    /** One thermometer input: today's value, its ranking history, and whether a low value means expensive. */
    private record Input(String key, String name, String code, boolean lowerIsExpensive) {}

    private static final List<Input> INPUTS = List.of(
            new Input("CAPE", "席勒 CAPE", "SPX_CAPE_D", false),
            new Input("BUFFETT", "巴菲特指标", "BUFFETT_D", false),
            new Input("PS", "市销率", "SPX_PS_D", false),
            new Input("FWD_PE", "远期 PE", "FS_FWD_PE", false),
            new Input("ERP", "实际股权风险溢价", "ERP_REAL_D", true));

    private final MvCalcService calc;

    public MvStatsService(MvCalcService calc) {
        this.calc = calc;
    }

    // ---------------------------------------------------------------- pure functions

    /** Points dated within [start, end]. */
    static List<SeriesPoint> within(List<SeriesPoint> base, LocalDate start, LocalDate end) {
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : base) if (!p.date().isBefore(start) && !p.date().isAfter(end)) out.add(p);
        return out;
    }

    /** Statistics of the base observations inside the window ending at {@code end}; null when there are none. */
    public static Stats windowStats(List<SeriesPoint> base, LocalDate end, Window window) {
        List<SeriesPoint> sample = within(base, window.start(end), end);
        if (sample.isEmpty()) return null;
        double[] v = sample.stream().mapToDouble(SeriesPoint::value).sorted().toArray();
        double mean = 0;
        for (double x : v) mean += x;
        mean /= v.length;
        double sq = 0;
        for (double x : v) sq += (x - mean) * (x - mean);
        double sd = v.length > 1 ? Math.sqrt(sq / (v.length - 1)) : 0;
        return new Stats(v.length, sample.get(0).date(), mean, sd, quantile(v, 0.10), quantile(v, 0.50), quantile(v, 0.90), v[0], v[v.length - 1]);
    }

    /** Linear-interpolated quantile of an ascending array. */
    private static double quantile(double[] sorted, double q) {
        double pos = q * (sorted.length - 1);
        int lo = (int) Math.floor(pos);
        int hi = (int) Math.ceil(pos);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    }

    /** Percent of base observations below {@code current}, counting ties as half; null for an empty base. */
    public static Double percentile(List<SeriesPoint> base, double current) {
        if (base.isEmpty()) return null;
        double below = 0;
        for (SeriesPoint p : base) {
            if (Math.abs(p.value() - current) < 1e-12) below += 0.5; else if (p.value() < current) below += 1;
        }
        return below / base.size() * 100;
    }

    /** The last observation of each calendar month, dated on the month's last day. */
    public static List<SeriesPoint> resampleMonthEnd(List<SeriesPoint> series) {
        TreeMap<YearMonth, SeriesPoint> last = new TreeMap<>();
        for (SeriesPoint p : series) last.merge(YearMonth.from(p.date()), p, (a, b) -> b.date().isBefore(a.date()) ? a : b);
        List<SeriesPoint> out = new ArrayList<>(last.size());
        last.forEach((ym, p) -> out.add(new SeriesPoint(ym.atEndOfMonth(), p.value())));
        return out;
    }

    public static String level(double temperature) {
        if (temperature < 20) return "极便宜";
        if (temperature < 40) return "偏便宜";
        if (temperature < 60) return "中性";
        if (temperature < 80) return "偏贵";
        if (temperature < 95) return "昂贵";
        return "历史极端";
    }

    /** Which series ranks a value of {@code code}: the sparse fundamentals series for daily estimates, otherwise itself (month-end for daily / weekly data). */
    public static Baseline baseline(String code) {
        return switch (code) {
            case "SPX_CAPE_D" -> new Baseline("SPX_CAPE", false, MIN_MONTHLY);
            case "SPX_PE_D" -> new Baseline("SPX_PE", false, MIN_MONTHLY);
            case "SPX_DY_D" -> new Baseline("SPX_DY", false, MIN_MONTHLY);
            case "BUFFETT_D" -> new Baseline("BUFFETT_Q", false, MIN_QUARTERLY);
            case "SPX_PS_D" -> new Baseline("SPX_PS", false, MIN_QUARTERLY);
            case "SPX_PB_D" -> new Baseline("SPX_PB", false, MIN_QUARTERLY);
            default -> {
                MvSeries.Frequency f = MvCatalog.find(code).map(MvCatalog.Info::frequency).orElse(MvSeries.Frequency.DAILY);
                boolean quarterly = f == MvSeries.Frequency.QUARTERLY;
                yield new Baseline(code, f == MvSeries.Frequency.DAILY || f == MvSeries.Frequency.WEEKLY, quarterly ? MIN_QUARTERLY : MIN_MONTHLY);
            }
        };
    }

    // ---------------------------------------------------------------- reads

    /** The observations a value of {@code code} is ranked against, restricted to the window ending at {@code end}. */
    public List<SeriesPoint> baseSeries(MvCalcService.Session session, String code, LocalDate end, Window window) {
        Baseline b = baseline(code);
        LocalDate start = window.start(end);
        List<SeriesPoint> raw = session.get(b.code(), start);
        return within(b.resampleMonthEnd() ? resampleMonthEnd(raw) : raw, start, end);
    }

    public Percentile percentileOf(MvCalcService.Session session, String code, double current, LocalDate end, Window window) {
        List<SeriesPoint> base = baseSeries(session, code, end, window);
        Double p = percentile(base, current);
        return new Percentile(p, base.isEmpty() ? null : base.get(0).date(), base.size(), base.size() >= baseline(code).minSamples());
    }

    public Stats statsFor(MvCalcService.Session session, String code, LocalDate end, Window window) {
        return windowStats(baseSeries(session, code, end, window), end, window);
    }

    /**
     * The thermometer: the mean of each usable component's "more expensive = higher" percentile (the risk premium is inverted).
     * {@code fredConfigured} only decides the wording of the reason when a FRED-based component has no data.
     */
    public Temperature temperature(MvCalcService.Session session, Window window, LocalDate today, boolean fredConfigured) {
        List<Component> components = new ArrayList<>();
        double sum = 0;
        int used = 0;
        for (Input in : INPUTS) {
            SeriesPoint current = MvCalcService.last(session.get(in.code(), today.minusDays(400)));
            if (current == null) {
                boolean needsFred = MvCatalog.find(in.code()).map(MvCatalog.Info::needsFred).orElse(false);
                String reason = needsFred && !fredConfigured ? "需要 FRED API Key" : "无数据";
                components.add(new Component(in.key(), in.name(), in.code(), null, null, null, null, 0, true, reason));
                continue;
            }
            Percentile p = percentileOf(session, in.code(), current.value(), current.date(), window);
            if (!p.enough() || p.percentile() == null) {
                components.add(new Component(in.key(), in.name(), in.code(), current.value(), current.date(), null, p.sampleStart(), p.n(), true, "样本不足"));
                continue;
            }
            double expensive = in.lowerIsExpensive() ? 100 - p.percentile() : p.percentile();
            components.add(new Component(in.key(), in.name(), in.code(), current.value(), current.date(), expensive, p.sampleStart(), p.n(), false, null));
            sum += expensive;
            used++;
        }
        if (used == 0) return new Temperature(null, null, components);
        double value = sum / used;
        return new Temperature(value, level(value), components);
    }
}
