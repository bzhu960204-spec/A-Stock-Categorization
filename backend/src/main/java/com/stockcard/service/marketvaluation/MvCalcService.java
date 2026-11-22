package com.stockcard.service.marketvaluation;

import com.stockcard.entity.MvObservation;
import com.stockcard.repository.MvManualSeriesRepository;
import com.stockcard.repository.MvObservationRepository;
import com.stockcard.service.liquidity.SeriesPoint;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.DoubleBinaryOperator;
import java.util.function.DoubleUnaryOperator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads series and computes the derived ones (design §3.2, §5.5). All formulas are pure static functions over {@link SeriesPoint} lists,
 * so they are testable without a database; the instance methods only decide which inputs to load and how far back.
 */
@Service
public class MvCalcService {

    /** How the price belonging to a fundamentals anchor is chosen (design §3.2.1). */
    public enum AnchorPriceRule { MONTH_AVG, AS_OF_CLOSE }

    /** PRICE_OVER_X for P/E-like ratios, YIELD for dividend yield. */
    public enum Kind { PRICE_OVER_X, YIELD }

    public record Anchor(LocalDate date, double value, AnchorPriceRule rule) {}

    private static final LocalDate EARLIEST = LocalDate.of(1800, 1, 1);
    private static final LocalDate LATEST = LocalDate.of(2999, 12, 31);
    private static final Pattern WPE_Z = Pattern.compile("WPE_([A-Z]+)_Z(\\d+)Y");
    private static final int ANCHOR_LOOKBACK_DAYS = 400;
    private static final int REVISION_TOLERANCE_DAYS = 14;

    private final MvObservationRepository obsRepo;
    private final MvManualSeriesRepository manualRepo;

    public MvCalcService(MvObservationRepository obsRepo, MvManualSeriesRepository manualRepo) {
        this.obsRepo = obsRepo;
        this.manualRepo = manualRepo;
    }

    /** One computation context: series loaded or derived once are reused by everything that follows. */
    public Session session() {
        return new Session();
    }

    /** Series for {@code codes} restricted to [from, to]; 400 for unknown codes. Derived series pull in their inputs with extra look-back. */
    public Map<String, List<SeriesPoint>> getSeries(Set<String> codes, LocalDate from, LocalDate to) {
        Session session = session();
        Map<String, List<SeriesPoint>> out = new LinkedHashMap<>();
        for (String code : codes) {
            out.put(code, session.get(code, from).stream().filter(p -> !p.date().isAfter(to)).toList());
        }
        return out;
    }

    public final class Session {
        private record Cached(LocalDate from, List<SeriesPoint> points) {}

        private final Map<String, Cached> cache = new HashMap<>();

        /** All points of {@code code} dated on or after {@code from}, oldest first. */
        public List<SeriesPoint> get(String code, LocalDate from) {
            LocalDate start = from.isBefore(EARLIEST) ? EARLIEST : from;
            Cached hit = cache.get(code);
            if (hit != null && !hit.from().isAfter(start)) return trim(hit.points(), start);
            List<SeriesPoint> loaded = load(code, start);
            cache.put(code, new Cached(start, loaded));
            return loaded;
        }

        private List<SeriesPoint> trim(List<SeriesPoint> points, LocalDate start) {
            int i = firstIndexOnOrAfter(points, start);
            return i == 0 ? points : points.subList(i, points.size());
        }

        private List<SeriesPoint> load(String code, LocalDate from) {
            MvCatalog.Info info = MvCatalog.find(code).orElse(null);
            if (info == null) {
                if (code != null && code.startsWith("M_") && manualRepo.existsById(code)) return raw(code, from);
                throw new IllegalArgumentException("未知序列: " + code);
            }
            return info.kind() == MvSeries.Kind.DERIVED ? derived(code, from) : raw(code, from);
        }

        private List<SeriesPoint> raw(String code, LocalDate from) {
            List<MvObservation> rows = obsRepo.findRange(code, from, LATEST);
            List<SeriesPoint> out = new ArrayList<>(rows.size());
            for (MvObservation o : rows) out.add(new SeriesPoint(o.getObsDate(), o.getObsValue()));
            return out;
        }

        private List<SeriesPoint> in(String code, LocalDate from, int extraDays) {
            return get(code, from.minusDays(extraDays));
        }

        private List<SeriesPoint> derived(String code, LocalDate from) {
            Matcher z = WPE_Z.matcher(code);
            if (z.matches()) {
                String m = "WPE_" + z.group(1);
                String years = z.group(2);
                return zScore(get(m, from), get(m + "_AVG" + years + "Y", from), get(m + "_SD" + years + "Y", from));
            }
            MvSeries s = MvSeries.valueOf(code);
            List<SeriesPoint> result = switch (s) {
                case SPX_CAPE_D -> anchored("SPX_CAPE", "SPX_CAPE_SPOT", AnchorPriceRule.MONTH_AVG, Kind.PRICE_OVER_X, from);
                case SPX_PE_D -> anchored("SPX_PE", "SPX_PE_SPOT", AnchorPriceRule.MONTH_AVG, Kind.PRICE_OVER_X, from);
                case SPX_PB_D -> anchored("SPX_PB", "SPX_PB_SPOT", AnchorPriceRule.AS_OF_CLOSE, Kind.PRICE_OVER_X, from);
                case SPX_PS_D -> anchored("SPX_PS", "SPX_PS_SPOT", AnchorPriceRule.AS_OF_CLOSE, Kind.PRICE_OVER_X, from);
                case SPX_DY_D -> anchored("SPX_DY", "SPX_DY_SPOT", AnchorPriceRule.MONTH_AVG, Kind.YIELD, from);
                case SPX_EY_D -> map(get("SPX_PE_D", from), v -> 100 / v);
                case SPX_CAPE_EY_D -> map(get("SPX_CAPE_D", from), v -> 100 / v);
                case US_EQ_MV -> sameDateJoin(get("EQ_NONFIN", from), get("EQ_FIN", from), Double::sum);
                case BUFFETT_Q -> buffettQuarterly(get("US_EQ_MV", from), in("GDP", from, 100));
                case BUFFETT_D -> buffettDaily(in("US_EQ_MV", from, 400), in("GDP", from, 400), in("PX_W5000", from, 400));
                case TOBIN_Q -> sameDateJoin(get("EQ_NONFIN", from), get("NW_NONFIN", from), (a, b) -> a / b);
                case ERP_REAL_D -> sameDateJoin(get("SPX_CAPE_EY_D", from), get("TIPS10Y", from), (a, b) -> a - b);
                case ERP_NOM_D -> sameDateJoin(get("SPX_EY_D", from), get("UST10Y", from), (a, b) -> a - b);
                case ERP_FWD -> forwardErp(get("FS_FWD_PE", from), in("UST10Y", from, 10));
                case SPX_EPS_YOY -> yoy(in("SPX_EPS", from, 400));
                case SPX_NET_MARGIN -> quarterRatio(get("SPX_SPS", from), in("SPX_EPS", from, 100));
                case SPX_ROE -> quarterRatio(get("SPX_BVPS", from), in("SPX_EPS", from, 100));
                case PROFIT_GDP -> sameDateJoin(get("CP_AFTER_TAX", from), get("GDP", from), (a, b) -> a / b * 100);
                case FS_FWD_EPS -> forwardEps(get("FS_FWD_PE", from), get("FS_CLOSE", from), in("PX_SPX", from, 10));
                case FS_FWD_EPS_CHG_4W -> revision(in("FS_FWD_EPS", from, 100), 28);
                case FS_FWD_EPS_CHG_13W -> revision(in("FS_FWD_EPS", from, 100), 91);
                case RSP_SPY -> sameDateJoin(get("PX_RSP", from), get("PX_SPY", from), (a, b) -> a / b);
                default -> throw new IllegalStateException("not a derived series: " + code);
            };
            return trim(result, from);
        }

        private List<SeriesPoint> anchored(String monthly, String spot, AnchorPriceRule monthlyRule, Kind kind, LocalDate from) {
            List<Anchor> anchors = new ArrayList<>();
            for (SeriesPoint p : in(monthly, from, ANCHOR_LOOKBACK_DAYS)) anchors.add(new Anchor(p.date(), p.value(), monthlyRule));
            for (SeriesPoint p : in(spot, from, ANCHOR_LOOKBACK_DAYS)) anchors.add(new Anchor(p.date(), p.value(), AnchorPriceRule.AS_OF_CLOSE));
            return anchorScale(anchors, in("PX_SPX", from, ANCHOR_LOOKBACK_DAYS), kind);
        }
    }

    // ---------------------------------------------------------------- pure functions

    /**
     * Daily valuation from sparse fundamentals (design §1.3, §3.2.1). Every anchor implies a fundamental
     * {@code F = anchorPrice / anchorValue} (or {@code anchorValue * anchorPrice} for yields); each price day is then
     * valued against the latest anchor dated on or before it. When two anchors share a date the later one in the list wins
     * (put spot rows after monthly rows). Nothing is produced before the first usable anchor.
     */
    public static List<SeriesPoint> anchorScale(List<Anchor> anchors, List<SeriesPoint> prices, Kind kind) {
        List<SeriesPoint> out = new ArrayList<>();
        if (anchors.isEmpty() || prices.isEmpty()) return out;

        Map<YearMonth, double[]> monthSums = new HashMap<>();
        for (SeriesPoint p : prices) {
            double[] acc = monthSums.computeIfAbsent(YearMonth.from(p.date()), k -> new double[2]);
            acc[0] += p.value();
            acc[1]++;
        }

        List<Anchor> sorted = new ArrayList<>(anchors);
        sorted.sort(Comparator.comparing(Anchor::date)); // stable: ties keep their input order
        List<LocalDate> factorDates = new ArrayList<>();
        List<Double> factors = new ArrayList<>();
        for (Anchor a : sorted) {
            Double price;
            if (a.rule() == AnchorPriceRule.MONTH_AVG) {
                double[] acc = monthSums.get(YearMonth.from(a.date()));
                price = acc == null ? null : acc[0] / acc[1];
            } else {
                SeriesPoint p = asOf(prices, a.date());
                price = p == null ? null : p.value();
            }
            if (price == null || !(a.value() > 0)) continue;
            factorDates.add(a.date());
            factors.add(kind == Kind.PRICE_OVER_X ? price / a.value() : a.value() * price);
        }
        if (factors.isEmpty()) return out;

        int idx = -1;
        for (SeriesPoint p : prices) {
            while (idx + 1 < factorDates.size() && !factorDates.get(idx + 1).isAfter(p.date())) idx++;
            if (idx < 0) continue;
            double f = factors.get(idx);
            out.add(new SeriesPoint(p.date(), kind == Kind.PRICE_OVER_X ? p.value() / f : f / p.value()));
        }
        return out;
    }

    /** Last point dated on or before {@code date}, or null. */
    public static SeriesPoint asOf(List<SeriesPoint> series, LocalDate date) {
        int i = firstIndexOnOrAfter(series, date.plusDays(1)) - 1;
        return i < 0 ? null : series.get(i);
    }

    /** As {@link #asOf(List, LocalDate)} but null when the point is more than {@code maxAgeDays} older than {@code date}. */
    public static SeriesPoint asOf(List<SeriesPoint> series, LocalDate date, int maxAgeDays) {
        SeriesPoint p = asOf(series, date);
        return p == null || p.date().isBefore(date.minusDays(maxAgeDays)) ? null : p;
    }

    static int firstIndexOnOrAfter(List<SeriesPoint> series, LocalDate date) {
        int lo = 0;
        int hi = series.size();
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (series.get(mid).date().isBefore(date)) lo = mid + 1; else hi = mid;
        }
        return lo;
    }

    public static List<SeriesPoint> map(List<SeriesPoint> series, DoubleUnaryOperator f) {
        List<SeriesPoint> out = new ArrayList<>(series.size());
        for (SeriesPoint p : series) {
            double v = f.applyAsDouble(p.value());
            if (Double.isFinite(v)) out.add(new SeriesPoint(p.date(), v));
        }
        return out;
    }

    /** One point for every date present in both series. */
    public static List<SeriesPoint> sameDateJoin(List<SeriesPoint> a, List<SeriesPoint> b, DoubleBinaryOperator f) {
        Map<LocalDate, Double> right = new HashMap<>();
        for (SeriesPoint p : b) right.put(p.date(), p.value());
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : a) {
            Double r = right.get(p.date());
            if (r == null) continue;
            double v = f.applyAsDouble(p.value(), r);
            if (Double.isFinite(v)) out.add(new SeriesPoint(p.date(), v));
        }
        return out;
    }

    /** For each left point, combines it with the latest right point dated on or before it (left points without one are dropped). */
    public static List<SeriesPoint> asOfJoin(List<SeriesPoint> left, List<SeriesPoint> right, DoubleBinaryOperator f) {
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : left) {
            SeriesPoint r = asOf(right, p.date());
            if (r == null) continue;
            double v = f.applyAsDouble(p.value(), r.value());
            if (Double.isFinite(v)) out.add(new SeriesPoint(p.date(), v));
        }
        return out;
    }

    /** Year-on-year change in percent against the same month-end one year earlier. */
    public static List<SeriesPoint> yoy(List<SeriesPoint> series) {
        Map<YearMonth, Double> byMonth = new HashMap<>();
        for (SeriesPoint p : series) byMonth.put(YearMonth.from(p.date()), p.value());
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : series) {
            Double prev = byMonth.get(YearMonth.from(p.date()).minusYears(1));
            if (prev != null && prev > 0) out.add(new SeriesPoint(p.date(), (p.value() / prev - 1) * 100));
        }
        return out;
    }

    /** {@code (value - mean) / sd} on dates where all three exist and sd is positive. */
    public static List<SeriesPoint> zScore(List<SeriesPoint> value, List<SeriesPoint> mean, List<SeriesPoint> sd) {
        Map<LocalDate, Double> means = new HashMap<>();
        Map<LocalDate, Double> sds = new HashMap<>();
        for (SeriesPoint p : mean) means.put(p.date(), p.value());
        for (SeriesPoint p : sd) sds.put(p.date(), p.value());
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : value) {
            Double m = means.get(p.date());
            Double s = sds.get(p.date());
            if (m != null && s != null && s > 0) out.add(new SeriesPoint(p.date(), (p.value() - m) / s));
        }
        return out;
    }

    /** Official-style Buffett indicator: quarter-end equity value over GDP of that same quarter (GDP is dated the quarter's first day). */
    public static List<SeriesPoint> buffettQuarterly(List<SeriesPoint> equityValue, List<SeriesPoint> gdp) {
        Map<LocalDate, Double> gdpByDate = new HashMap<>();
        for (SeriesPoint p : gdp) gdpByDate.put(p.date(), p.value());
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint q : equityValue) {
            Double g = gdpByDate.get(q.date().withDayOfMonth(1).minusMonths(2));
            if (g != null && g > 0) out.add(new SeriesPoint(q.date(), q.value() / g * 100));
        }
        return out;
    }

    /**
     * Daily Buffett indicator: the latest quarter-end equity value is carried forward on Wilshire 5000 and divided by the
     * latest GDP known on that day.
     */
    public static List<SeriesPoint> buffettDaily(List<SeriesPoint> equityValue, List<SeriesPoint> gdp, List<SeriesPoint> w5000) {
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint w : w5000) {
            SeriesPoint q = asOf(equityValue, w.date());
            if (q == null) continue;
            SeriesPoint base = asOf(w5000, q.date());
            SeriesPoint g = asOf(gdp, w.date());
            if (base == null || g == null || !(g.value() > 0)) continue;
            out.add(new SeriesPoint(w.date(), q.value() * w.value() / base.value() / g.value() * 100));
        }
        return out;
    }

    /** {@code 100 / forwardPE - yield} using the latest yield within ten days of each report. */
    public static List<SeriesPoint> forwardErp(List<SeriesPoint> forwardPe, List<SeriesPoint> yield) {
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : forwardPe) {
            SeriesPoint y = asOf(yield, p.date(), 10);
            if (y != null && p.value() > 0) out.add(new SeriesPoint(p.date(), 100 / p.value() - y.value()));
        }
        return out;
    }

    /** Implied forward EPS = report close / forward PE; without a reported close the S&P 500 close on or before the report date is used. */
    public static List<SeriesPoint> forwardEps(List<SeriesPoint> forwardPe, List<SeriesPoint> reportClose, List<SeriesPoint> spx) {
        Map<LocalDate, Double> closes = new HashMap<>();
        for (SeriesPoint p : reportClose) closes.put(p.date(), p.value());
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : forwardPe) {
            Double close = closes.get(p.date());
            if (close == null) {
                SeriesPoint px = asOf(spx, p.date(), 10);
                if (px == null) continue;
                close = px.value();
            }
            if (p.value() > 0) out.add(new SeriesPoint(p.date(), close / p.value()));
        }
        return out;
    }

    /** Percent change against the point {@code days} earlier; a gap of more than two weeks around that date (missing weeks) skips the point. */
    public static List<SeriesPoint> revision(List<SeriesPoint> series, int days) {
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : series) {
            SeriesPoint prev = asOf(series, p.date().minusDays(days), REVISION_TOLERANCE_DAYS);
            if (prev != null && prev.value() > 0) out.add(new SeriesPoint(p.date(), (p.value() / prev.value() - 1) * 100));
        }
        return out;
    }

    /** EPS divided by (sales per share | book value per share) at each quarter end, in percent; dates are matched by month. */
    static List<SeriesPoint> quarterRatio(List<SeriesPoint> denominator, List<SeriesPoint> eps) {
        Map<YearMonth, Double> epsByMonth = new HashMap<>();
        for (SeriesPoint p : eps) epsByMonth.put(YearMonth.from(p.date()), p.value());
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint d : denominator) {
            Double e = epsByMonth.get(YearMonth.from(d.date()));
            if (e != null && d.value() > 0) out.add(new SeriesPoint(d.date(), e / d.value() * 100));
        }
        return out;
    }

    /** The last point of a series, or null. */
    public static SeriesPoint last(List<SeriesPoint> series) {
        return series.isEmpty() ? null : series.get(series.size() - 1);
    }
}
