package com.stockcard.service.liquidity;

import com.stockcard.entity.LiquidityObservation;
import com.stockcard.repository.LiquidityManualSeriesRepository;
import com.stockcard.repository.LiquidityObservationRepository;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Stream;

/**
 * Series access and derived-series maths (design §3.2, §5.5). The maths are pure static functions so they can be
 * tested without a database; the instance methods only load the inputs.
 */
@Service
public class LiquidityCalcService {

    /** Extra history loaded before {@code from}, so the as-of join and the weekly windows have inputs at the left edge. */
    private static final int LOOKBACK_DAYS = 30;

    static final int FOUR_WEEKS = 28;
    static final int SOMA_13W_DAYS = 91;
    static final int RATE_CHANGE_DAYS = 182;
    static final int QE_OPS_DAYS = 28;
    private static final int NONSEC_SOMA_TOLERANCE_DAYS = 6;
    private static final int NET_LIQ_TGA_TOLERANCE_DAYS = 5;

    /** Eras of the Goldman Sachs Exhibit 5 scatter; boundaries are the first day of the next era. */
    static final LocalDate ERA_MID_START = LocalDate.of(2021, 9, 1);
    static final LocalDate ERA_RECENT_START = LocalDate.of(2026, 4, 1);

    public record ScatterPoint(LocalDate weekEnd, double ratio, double tgcrIorb, String era) {}

    private final LiquidityObservationRepository obsRepo;
    private final LiquidityManualSeriesRepository manualRepo;

    public LiquidityCalcService(LiquidityObservationRepository obsRepo, LiquidityManualSeriesRepository manualRepo) {
        this.obsRepo = obsRepo;
        this.manualRepo = manualRepo;
    }

    // ---- loading ----

    /** Raw, manual or derived series for {@code [from, to]}; an unknown code is an IllegalArgumentException (HTTP 400). */
    public Map<String, List<SeriesPoint>> getSeries(Set<String> codes, LocalDate from, LocalDate to) {
        Map<String, List<SeriesPoint>> cache = new HashMap<>();
        Map<String, List<SeriesPoint>> out = new LinkedHashMap<>();
        for (String code : codes) {
            out.put(code, series(code, from, to, cache));
        }
        return out;
    }

    public List<SeriesPoint> getSeries(String code, LocalDate from, LocalDate to) {
        return series(code, from, to, new HashMap<>());
    }

    List<SeriesPoint> series(String code, LocalDate from, LocalDate to, Map<String, List<SeriesPoint>> cache) {
        LiquiditySeries known = LiquiditySeries.find(code).orElse(null);
        if (known == null) {
            if (!manualRepo.existsById(code)) throw new IllegalArgumentException("未知序列: " + code);
            return load(code, from, to);
        }
        if (!known.isDerived()) return load(code, from, to);

        boolean monthly = known.frequency() == LiquiditySeries.Frequency.MONTHLY && known.isDerived();
        // Monthly sums need the whole first month as input and keep the (month-end dated) current month.
        LocalDate inputFrom = monthly ? from.withDayOfMonth(1) : from.minusDays(lookbackDays(known));
        LocalDate outputTo = monthly ? YearMonth.from(to).atEndOfMonth() : to;
        Function<String, List<SeriesPoint>> raw =
                c -> cache.computeIfAbsent(c + "|" + inputFrom + "|" + to, k -> load(c, inputFrom, to));
        return window(known == LiquiditySeries.QE_OPS_28D ? qeOps28d(raw, inputFrom, to) : derive(known, raw, to), from, outputTo);
    }

    /** Rolling 28-day purchases; defined from the first purchase ever stored, so a quiet year shows 0 instead of no data. */
    private List<SeriesPoint> qeOps28d(Function<String, List<SeriesPoint>> raw, LocalDate inputFrom, LocalDate to) {
        LocalDate firstOp = Stream.of("COUPON_OPS_NET", "AGENCY_OPS_NET").map(obsRepo::minObsDate)
                .filter(Objects::nonNull).min(Comparator.naturalOrder()).orElse(null);
        if (firstOp == null) return List.of();
        List<SeriesPoint> ops = mergeSum(raw.apply("COUPON_OPS_NET"), raw.apply("AGENCY_OPS_NET"));
        return trailingSum(ops, QE_OPS_DAYS, firstOp.isBefore(inputFrom) ? inputFrom : firstOp, to);
    }

    /** How far before {@code from} a derived series needs its inputs: its longest change window plus the as-of tolerance. */
    static int lookbackDays(LiquiditySeries series) {
        return switch (series) {
            case RATE_CHANGE_6M -> 200;
            case SOMA_13W, SOMA_BILLS_13W, SOMA_LONG_13W, NET_LIQ_13W -> 110;
            case QE_OPS_28D, NONSEC_4W, NET_LIQ_4W, PRIMARY_CREDIT_4W, CB_SWAPS_4W -> 45;
            default -> LOOKBACK_DAYS;
        };
    }

    private List<SeriesPoint> load(String code, LocalDate from, LocalDate to) {
        List<SeriesPoint> out = new ArrayList<>();
        for (LiquidityObservation o : obsRepo.findBySeriesCodeAndObsDateBetweenOrderByObsDateAsc(code, from, to)) {
            out.add(new SeriesPoint(o.getObsDate(), o.getObsValue()));
        }
        return out;
    }

    /** Goldman Exhibit 5: weekly (Wednesday) LIQ_RATIO vs the average TGCR − IORB over the same Thursday-to-Wednesday week. */
    public List<ScatterPoint> scatter(LocalDate from, LocalDate to) {
        List<SeriesPoint> ratio = getSeries("LIQ_RATIO", from, to);
        List<SeriesPoint> spread = getSeries("TGCR_IORB", from.minusDays(7), to);
        List<ScatterPoint> out = new ArrayList<>();
        for (SeriesPoint r : ratio) {
            List<SeriesPoint> week = window(spread, r.date().minusDays(6), r.date());
            if (week.isEmpty()) continue;
            out.add(new ScatterPoint(r.date(), r.value(), round(average(week)), eraOf(r.date())));
        }
        return out;
    }

    static String eraOf(LocalDate date) {
        if (date.isBefore(ERA_MID_START)) return "EARLY";
        return date.isBefore(ERA_RECENT_START) ? "MID" : "RECENT";
    }

    // ---- derived series (pure) ----

    static List<SeriesPoint> derive(LiquiditySeries series, Function<String, List<SeriesPoint>> raw) {
        return derive(series, raw, null);
    }

    /** {@code to} is only needed by series that are defined on every weekday up to the end of the range (QE_OPS_28D). */
    static List<SeriesPoint> derive(LiquiditySeries series, Function<String, List<SeriesPoint>> raw, LocalDate to) {
        return switch (series) {
            case SOFR_IORB -> spreadBpAsOf(raw.apply("SOFR"), raw.apply("IORB"));
            case TGCR_IORB -> spreadBpAsOf(raw.apply("TGCR"), raw.apply("IORB"));
            case SOFR99_IORB -> spreadBpAsOf(raw.apply("SOFR_P99"), raw.apply("IORB"));
            case EFFR_IORB -> spreadBpAsOf(raw.apply("EFFR"), raw.apply("IORB"));
            case SOFR_EFFR -> spreadBp(raw.apply("SOFR"), raw.apply("EFFR"));
            case SOFR_RRP -> spreadBp(raw.apply("SOFR"), raw.apply("ONRRP_RATE"));
            case RES_PLUS_RRP -> reservesPlusRrp(raw.apply("RESERVES"), raw.apply("ONRRP_AMT"));
            case LIQ_RATIO -> liqRatio(raw.apply("RESERVES"), raw.apply("ONRRP_AMT"), raw.apply("BANK_ASSETS"));
            case RMP_MONTHLY -> monthlySum(raw.apply("RMP_BILLS"));
            case SOMA_13W -> changeOver(raw.apply("SOMA_TOTAL"), SOMA_13W_DAYS);
            case SOMA_BILLS_13W -> changeOver(raw.apply("SOMA_BILLS"), SOMA_13W_DAYS);
            case SOMA_LONG_13W -> changeOver(sumOnSharedDates(raw.apply("SOMA_COUPONS"), raw.apply("SOMA_MBS")), SOMA_13W_DAYS);
            case QE_OPS_28D -> {
                List<SeriesPoint> ops = mergeSum(raw.apply("COUPON_OPS_NET"), raw.apply("AGENCY_OPS_NET"));
                yield ops.isEmpty() ? List.of() : trailingSum(ops, QE_OPS_DAYS, ops.get(0).date(), to);
            }
            case NONSEC_ASSETS -> nonSecurities(raw.apply("FED_ASSETS"), raw.apply("SOMA_TOTAL"));
            case NONSEC_4W -> changeOver(nonSecurities(raw.apply("FED_ASSETS"), raw.apply("SOMA_TOTAL")), FOUR_WEEKS);
            case PRIMARY_CREDIT_4W -> changeOver(raw.apply("PRIMARY_CREDIT"), FOUR_WEEKS);
            case CB_SWAPS_4W -> changeOver(raw.apply("CB_SWAPS"), FOUR_WEEKS);
            case NET_LIQ -> netLiquidity(raw.apply("FED_ASSETS"), raw.apply("TGA"), raw.apply("ONRRP_AMT"));
            case NET_LIQ_4W -> changeOver(netLiquidity(raw.apply("FED_ASSETS"), raw.apply("TGA"), raw.apply("ONRRP_AMT")), FOUR_WEEKS);
            case NET_LIQ_13W -> changeOver(netLiquidity(raw.apply("FED_ASSETS"), raw.apply("TGA"), raw.apply("ONRRP_AMT")), SOMA_13W_DAYS);
            case CUT_PRICING -> spreadBp(raw.apply("UST2Y"), raw.apply("EFFR"));
            case RATE_CHANGE_6M -> changeOver(raw.apply("FFTR_HIGH"), RATE_CHANGE_DAYS, 100);
            default -> throw new IllegalArgumentException("不是派生序列: " + series.code());
        };
    }

    /** value(t) − as-of value(t − days) for every point that has an earlier observation (floor lookup, so holidays are fine). */
    static List<SeriesPoint> changeOver(List<SeriesPoint> points, int days) {
        return changeOver(points, days, 1);
    }

    static List<SeriesPoint> changeOver(List<SeriesPoint> points, int days, double scale) {
        TreeMap<LocalDate, Double> byDate = new TreeMap<>(toMap(points));
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : points) {
            Map.Entry<LocalDate, Double> earlier = byDate.floorEntry(p.date().minusDays(days));
            if (earlier != null) out.add(new SeriesPoint(p.date(), round((p.value() - earlier.getValue()) * scale)));
        }
        return out;
    }

    /**
     * Rolling sum of the last {@code windowDays} days (today included) for every weekday from {@code start} to {@code to}
     * (the last event when {@code to} is null). Days without events count as 0, so the series decays back to 0 after a programme ends.
     */
    static List<SeriesPoint> trailingSum(List<SeriesPoint> events, int windowDays, LocalDate start, LocalDate to) {
        TreeMap<LocalDate, Double> byDate = new TreeMap<>(toMap(events));
        LocalDate end = to != null ? to : byDate.isEmpty() ? start : byDate.lastKey();
        List<SeriesPoint> out = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            DayOfWeek dow = d.getDayOfWeek();
            if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) continue;
            double sum = byDate.subMap(d.minusDays(windowDays - 1L), true, d, true).values().stream().mapToDouble(Double::doubleValue).sum();
            out.add(new SeriesPoint(d, round(sum)));
        }
        return out;
    }

    /** Fed total assets (weekly) minus the SOMA holding in force that day; skipped when the latest SOMA point is over 6 days old. */
    static List<SeriesPoint> nonSecurities(List<SeriesPoint> fedAssets, List<SeriesPoint> somaTotal) {
        TreeMap<LocalDate, Double> soma = new TreeMap<>(toMap(somaTotal));
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : fedAssets) {
            Double s = asOfWithin(soma, p.date(), NONSEC_SOMA_TOLERANCE_DAYS);
            if (s != null) out.add(new SeriesPoint(p.date(), round(p.value() - s)));
        }
        return out;
    }

    /** Fed assets − TGA (latest within 5 days, else the day is skipped) − ON RRP (latest; none counts as 0). */
    static List<SeriesPoint> netLiquidity(List<SeriesPoint> fedAssets, List<SeriesPoint> tga, List<SeriesPoint> onrrp) {
        TreeMap<LocalDate, Double> tgaByDate = new TreeMap<>(toMap(tga));
        TreeMap<LocalDate, Double> rrpByDate = new TreeMap<>(toMap(onrrp));
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : fedAssets) {
            Double t = asOfWithin(tgaByDate, p.date(), NET_LIQ_TGA_TOLERANCE_DAYS);
            if (t == null) continue;
            Map.Entry<LocalDate, Double> rrp = rrpByDate.floorEntry(p.date());
            out.add(new SeriesPoint(p.date(), round(p.value() - t - (rrp == null ? 0 : rrp.getValue()))));
        }
        return out;
    }

    private static Double asOfWithin(TreeMap<LocalDate, Double> byDate, LocalDate date, int toleranceDays) {
        Map.Entry<LocalDate, Double> e = byDate.floorEntry(date);
        return e == null || e.getKey().isBefore(date.minusDays(toleranceDays)) ? null : e.getValue();
    }

    private static List<SeriesPoint> sumOnSharedDates(List<SeriesPoint> a, List<SeriesPoint> b) {
        Map<LocalDate, Double> bByDate = toMap(b);
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : a) {
            Double other = bByDate.get(p.date());
            if (other != null) out.add(new SeriesPoint(p.date(), round(p.value() + other)));
        }
        return out;
    }

    /** Union of two event series, summing the values on a date that appears in both. */
    private static List<SeriesPoint> mergeSum(List<SeriesPoint> a, List<SeriesPoint> b) {
        TreeMap<LocalDate, Double> merged = new TreeMap<>();
        for (SeriesPoint p : a) merged.merge(p.date(), p.value(), Double::sum);
        for (SeriesPoint p : b) merged.merge(p.date(), p.value(), Double::sum);
        List<SeriesPoint> out = new ArrayList<>(merged.size());
        merged.forEach((d, v) -> out.add(new SeriesPoint(d, round(v))));
        return out;
    }

    /** (a − b) × 100 in basis points, only on dates where both series have an observation (no filling of holidays). */
    static List<SeriesPoint> spreadBp(List<SeriesPoint> a, List<SeriesPoint> b) {
        Map<LocalDate, Double> bByDate = toMap(b);
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : a) {
            Double other = bByDate.get(p.date());
            if (other != null) out.add(new SeriesPoint(p.date(), round((p.value() - other) * 100)));
        }
        return out;
    }

    /** (a − step) × 100 where {@code step} is a stair-step series (IORB): uses the latest step value on or before each date. */
    static List<SeriesPoint> spreadBpAsOf(List<SeriesPoint> a, List<SeriesPoint> step) {
        TreeMap<LocalDate, Double> stepByDate = new TreeMap<>(toMap(step));
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint p : a) {
            Map.Entry<LocalDate, Double> e = stepByDate.floorEntry(p.date());
            if (e != null) out.add(new SeriesPoint(p.date(), round((p.value() - e.getValue()) * 100)));
        }
        return out;
    }

    /** Reserves (weekly, Wednesday) plus the average ON RRP of that Thursday-to-Wednesday week; no RRP data counts as 0. */
    static List<SeriesPoint> reservesPlusRrp(List<SeriesPoint> reserves, List<SeriesPoint> onrrp) {
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint r : reserves) {
            out.add(new SeriesPoint(r.date(), round(r.value() + weeklyRrpAverage(onrrp, r.date()))));
        }
        return out;
    }

    /** (reserves + weekly ON RRP) / bank assets × 100, only on Wednesdays where reserves and bank assets both exist. */
    static List<SeriesPoint> liqRatio(List<SeriesPoint> reserves, List<SeriesPoint> onrrp, List<SeriesPoint> bankAssets) {
        Map<LocalDate, Double> assets = toMap(bankAssets);
        List<SeriesPoint> out = new ArrayList<>();
        for (SeriesPoint r : reserves) {
            Double bank = assets.get(r.date());
            if (bank == null || bank == 0) continue;
            out.add(new SeriesPoint(r.date(), round((r.value() + weeklyRrpAverage(onrrp, r.date())) / bank * 100)));
        }
        return out;
    }

    private static double weeklyRrpAverage(List<SeriesPoint> onrrp, LocalDate wednesday) {
        List<SeriesPoint> week = window(onrrp, wednesday.minusDays(6), wednesday);
        return week.isEmpty() ? 0 : average(week);
    }

    /** Sum per calendar month, dated on the last day of the month. */
    static List<SeriesPoint> monthlySum(List<SeriesPoint> points) {
        TreeMap<YearMonth, Double> sums = new TreeMap<>();
        for (SeriesPoint p : points) sums.merge(YearMonth.from(p.date()), p.value(), Double::sum);
        List<SeriesPoint> out = new ArrayList<>();
        sums.forEach((month, sum) -> out.add(new SeriesPoint(month.atEndOfMonth(), round(sum))));
        return out;
    }

    // ---- small helpers (also used by the weekly report and dashboard) ----

    static List<SeriesPoint> window(List<SeriesPoint> points, LocalDate from, LocalDate to) {
        return points.stream().filter(p -> !p.date().isBefore(from) && !p.date().isAfter(to)).toList();
    }

    static double average(List<SeriesPoint> points) {
        return points.stream().mapToDouble(SeriesPoint::value).average().orElse(Double.NaN);
    }

    private static Map<LocalDate, Double> toMap(List<SeriesPoint> points) {
        Map<LocalDate, Double> m = new HashMap<>();
        for (SeriesPoint p : points) m.put(p.date(), p.value());
        return m;
    }

    /** Rounds away floating-point noise such as (3.91 − 3.88) × 100 = 3.0000000000000027. */
    static double round(double value) {
        return Math.round(value * 1e6) / 1e6;
    }
}
