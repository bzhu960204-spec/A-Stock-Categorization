package com.stockcard.service.liquidity;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockcard.entity.LiquidityManualSeries;
import com.stockcard.entity.LiquidityWeeklyReport;
import com.stockcard.repository.LiquidityWeeklyReportRepository;
import com.stockcard.service.liquidity.qe.QeRadarService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;

/** The weekly "dollar circulation" report (design §5.6): computed live, optionally frozen as a snapshot with a commentary. */
@Service
public class LiquidityWeeklyService {

    public record WeeklyRow(String key, String label, String unit, String basis, Double current, Double previous, Double change,
                            LiquidityStatus status, LocalDate dataDate, String note) {}

    public record WeeklyReport(LocalDate weekStart, LocalDate weekEnd, LocalDate dataAsOf, LiquidityStatus overallStatus,
                               List<WeeklyRow> rows, List<String> observations) {}

    public record SnapshotSummary(Long id, LocalDate weekEnd, boolean hasCommentary, LocalDateTime updatedAt) {}

    public record SnapshotDetail(Long id, LocalDate weekEnd, JsonNode report, String commentary,
                                 LocalDateTime createdAt, LocalDateTime updatedAt) {}

    private enum Agg { AVG, MAX, LAST, SUM, COUNT_POSITIVE, AS_OF }

    /** One report line: which series, how to aggregate it over the week, and which threshold (if any) colours it. */
    private record RowSpec(String key, String label, String unit, String basis, String series, Agg agg, String thresholdCode) {}

    private static final ZoneId BEIJING = ZoneId.of("Asia/Shanghai");
    /** On a Friday, the week only counts as finished after the evening sync has had a chance to pull the day's data. */
    private static final LocalTime FRIDAY_CUTOFF = LocalTime.of(22, 30);
    private static final int HISTORY_DAYS = 60;
    private static final int MAX_OBSERVATIONS = 6;

    private static final List<RowSpec> SPECS = List.of(
            new RowSpec("SOFR_EFFR_AVG", "SOFR − EFFR（周均）", "bp", "周均", "SOFR_EFFR", Agg.AVG, "SOFR_EFFR"),
            new RowSpec("SOFR_IORB_AVG", "SOFR − IORB（周均）", "bp", "周均", "SOFR_IORB", Agg.AVG, "SOFR_IORB"),
            new RowSpec("SOFR_IORB_MAX", "SOFR − IORB（周内最高）", "bp", "周内最高", "SOFR_IORB", Agg.MAX, "SOFR_IORB"),
            new RowSpec("SOFR_IORB_DAYS", "SOFR 高于 IORB 天数", "天", "本周 SOFR − IORB > 0 的天数", "SOFR_IORB", Agg.COUNT_POSITIVE, null),
            new RowSpec("TGCR_IORB_AVG", "TGCR − IORB（周均）", "bp", "周均", "TGCR_IORB", Agg.AVG, "TGCR_IORB"),
            new RowSpec("SOFR99_IORB_MAX", "SOFR 99 分位 − IORB（周内最高）", "bp", "周内最高", "SOFR99_IORB", Agg.MAX, "SOFR99_IORB"),
            new RowSpec("SOFR_LAST", "SOFR", "%", "周五值（没有则取周内最后一个）", "SOFR", Agg.LAST, null),
            new RowSpec("SOFR_VOL_AVG", "SOFR 成交量（周均）", "bn", "周均", "SOFR_VOL", Agg.AVG, null),
            new RowSpec("RESERVES", "准备金", "bn", "该周三的周均值（H.4.1）", "RESERVES", Agg.AS_OF, null),
            new RowSpec("ONRRP_AVG", "ON RRP（周均）", "bn", "周均", "ONRRP_AMT", Agg.AVG, null),
            new RowSpec("ONRRP_LAST", "ON RRP（周五）", "bn", "周五值（没有则取周内最后一个）", "ONRRP_AMT", Agg.LAST, "ONRRP_AMT"),
            new RowSpec("TGA_LAST", "TGA", "bn", "周五值（没有则取周内最后一个）", "TGA", Agg.LAST, null),
            new RowSpec("SRF_SUM", "SRF 用量（周累计）", "bn", "周累计", "SRF_AMT", Agg.SUM, null),
            new RowSpec("SRF_MAX", "SRF 用量（单日最高）", "bn", "单日最高", "SRF_AMT", Agg.MAX, "SRF_AMT"),
            new RowSpec("RMP_SUM", "短债购买（RMP）", "bn", "本周合计", "RMP_BILLS", Agg.SUM, null),
            new RowSpec("LIQ_RATIO", "(准备金 + RRP) / 银行总资产", "%", "最近可得值（近似口径）", "LIQ_RATIO", Agg.AS_OF, "LIQ_RATIO"),
            new RowSpec("HY_OAS_LAST", "高收益债利差", "%", "周五值（没有则取周内最后一个）", "HY_OAS", Agg.LAST, null));

    private final LiquidityCalcService calc;
    private final LiquidityThresholdService thresholds;
    private final LiquidityManualService manual;
    private final LiquidityWeeklyReportRepository snapshotRepo;
    private final ObjectMapper mapper;
    private final QeRadarService radar;
    private final Clock clock;

    @Autowired
    public LiquidityWeeklyService(LiquidityCalcService calc, LiquidityThresholdService thresholds, LiquidityManualService manual,
                                  LiquidityWeeklyReportRepository snapshotRepo, ObjectMapper mapper, QeRadarService radar) {
        this(calc, thresholds, manual, snapshotRepo, mapper, radar, Clock.system(BEIJING));
    }

    LiquidityWeeklyService(LiquidityCalcService calc, LiquidityThresholdService thresholds, LiquidityManualService manual,
                           LiquidityWeeklyReportRepository snapshotRepo, ObjectMapper mapper, QeRadarService radar, Clock clock) {
        this.calc = calc;
        this.thresholds = thresholds;
        this.manual = manual;
        this.snapshotRepo = snapshotRepo;
        this.mapper = mapper;
        this.radar = radar;
        this.clock = clock;
    }

    // ---- live report ----

    /** The most recent Friday whose week is over (today if it is Friday after 22:30 Beijing time). */
    public LocalDate defaultWeekEnd() {
        return lastFinishedFriday(ZonedDateTime.now(clock));
    }

    static LocalDate lastFinishedFriday(ZonedDateTime now) {
        LocalDate today = now.toLocalDate();
        LocalDate friday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.FRIDAY));
        boolean thisWeekFinished = !friday.equals(today) || !now.toLocalTime().isBefore(FRIDAY_CUTOFF);
        return thisWeekFinished ? friday : friday.minusWeeks(1);
    }

    public WeeklyReport report(LocalDate weekEnd) {
        LocalDate end = weekEnd == null ? defaultWeekEnd() : weekEnd;
        if (end.getDayOfWeek() != DayOfWeek.FRIDAY) throw new IllegalArgumentException("weekEnd 必须是周五");
        LocalDate start = end.minusDays(4);

        List<RowSpec> specs = new ArrayList<>(SPECS);
        for (LiquidityManualSeries m : manual.list()) {
            specs.add(new RowSpec(m.getCode(), m.getName() + "（周内最新）", m.getUnit(), "周内最新值", m.getCode(), Agg.LAST, null));
        }
        Set<String> codes = new LinkedHashSet<>();
        specs.forEach(s -> codes.add(s.series()));
        Map<String, List<SeriesPoint>> data = calc.getSeries(codes, end.minusDays(HISTORY_DAYS), end);
        Map<String, ThresholdRule> rules = thresholds.effectiveRules();

        List<WeeklyRow> rows = new ArrayList<>();
        for (RowSpec spec : specs) {
            rows.add(buildRow(spec, data.getOrDefault(spec.series(), List.of()), start, end, rules.get(spec.thresholdCode())));
        }

        LiquidityStatus overall = LiquidityStatus.NONE;
        LocalDate asOf = null;
        for (int i = 0; i < specs.size(); i++) {
            WeeklyRow row = rows.get(i);
            String code = specs.get(i).thresholdCode();
            if (code != null && LiquidityDashboardService.OVERALL_CODES.contains(code)) overall = LiquidityStatus.worse(overall, row.status());
            if (row.dataDate() != null && (asOf == null || row.dataDate().isAfter(asOf))) asOf = row.dataDate();
        }
        Map<String, WeeklyRow> byKey = new LinkedHashMap<>();
        rows.forEach(r -> byKey.put(r.key(), r));
        return new WeeklyReport(start, end, asOf, overall, rows, withRadarLine(observations(byKey), end));
    }

    private static final Map<String, String> LIKELIHOOD_NAMES = Map.of("LOW", "低", "MEDIUM", "中", "HIGH", "高");

    /** The radar sentence is always the last one; a radar failure only drops it and never breaks the report. */
    private List<String> withRadarLine(List<String> observations, LocalDate weekEnd) {
        if (radar == null) return observations;
        try {
            QeRadarService.Assessment a = radar.assessAt(weekEnd);
            List<String> out = new ArrayList<>(observations);
            out.add("放水雷达：当前 L" + a.stage().level() + " " + a.stage().name() + "，升级可能性"
                    + LIKELIHOOD_NAMES.getOrDefault(a.likelihood().level().name(), "") + "。");
            return out;
        } catch (RuntimeException e) {
            return observations;
        }
    }

    private WeeklyRow buildRow(RowSpec spec, List<SeriesPoint> points, LocalDate start, LocalDate end, ThresholdRule rule) {
        Double current;
        Double previous;
        LocalDate dataDate = null;
        String note = null;

        if (spec.agg() == Agg.AS_OF) {
            int last = lastIndexOnOrBefore(points, end);
            SeriesPoint cur = last >= 0 ? points.get(last) : null;
            SeriesPoint prev = last >= 1 ? points.get(last - 1) : null;
            current = cur == null ? null : cur.value();
            previous = prev == null ? null : prev.value();
            dataDate = cur == null ? null : cur.date();
            if (cur != null) {
                boolean stale = cur.date().isBefore(end.minusDays(2));
                if (spec.key().equals("RESERVES")) {
                    if (stale) note = "未更新，沿用 " + cur.date() + " 的数据";
                } else {
                    note = "数据日期 " + cur.date();
                }
            }
        } else {
            current = aggregate(spec.agg(), points, start, end);
            previous = aggregate(spec.agg(), points, start.minusDays(7), end.minusDays(7));
            dataDate = LiquidityCalcService.window(points, start, end).stream().map(SeriesPoint::date).max(LocalDate::compareTo).orElse(null);
        }
        Double change = current == null || previous == null ? null : LiquidityCalcService.round(current - previous);
        LiquidityStatus status = rule == null ? LiquidityStatus.NONE : rule.evaluate(current);
        return new WeeklyRow(spec.key(), spec.label(), spec.unit(), spec.basis(), current, previous, change, status, dataDate, note);
    }

    private static int lastIndexOnOrBefore(List<SeriesPoint> points, LocalDate date) {
        int idx = -1;
        for (int i = 0; i < points.size(); i++) {
            if (points.get(i).date().isAfter(date)) break;
            idx = i;
        }
        return idx;
    }

    /** Aggregates one Monday-to-Friday window. Sums and counts are 0 for a quiet week, but null when the series has no data yet. */
    private static Double aggregate(Agg agg, List<SeriesPoint> points, LocalDate from, LocalDate to) {
        List<SeriesPoint> week = LiquidityCalcService.window(points, from, to);
        if (week.isEmpty()) {
            boolean quietWeek = (agg == Agg.SUM || agg == Agg.COUNT_POSITIVE) && points.stream().anyMatch(p -> !p.date().isAfter(to));
            return quietWeek ? Double.valueOf(0) : null;
        }
        return switch (agg) {
            case AVG -> LiquidityCalcService.round(LiquidityCalcService.average(week));
            case MAX -> week.stream().mapToDouble(SeriesPoint::value).max().getAsDouble();
            case LAST -> week.get(week.size() - 1).value();
            case SUM -> LiquidityCalcService.round(week.stream().mapToDouble(SeriesPoint::value).sum());
            case COUNT_POSITIVE -> (double) week.stream().filter(p -> p.value() > 0).count();
            case AS_OF -> throw new IllegalStateException("AS_OF is handled separately");
        };
    }

    // ---- automatic observations ----

    /** Each rule inspects the computed rows and returns a sentence, or empty when it has nothing to say. */
    private static final List<Function<Map<String, WeeklyRow>, Optional<String>>> RULES = List.of(
            rows -> {
                Double days = value(rows, "SOFR_IORB_DAYS");
                Double max = value(rows, "SOFR_IORB_MAX");
                if (days == null || max == null) return Optional.empty();
                if (days > 0) return Optional.of("SOFR 本周有 " + days.intValue() + " 天高于 IORB，最高 " + bp(max) + "。");
                return Optional.of("SOFR 本周没有高于 IORB，周内最高 " + bp(max) + "。");
            },
            rows -> {
                Double avg = value(rows, "SOFR_EFFR_AVG");
                return avg != null && avg >= -1
                        ? Optional.of("SOFR − EFFR 周均 " + bp(avg) + "，有担保利率理应比无担保低约 2bp。") : Optional.<String>empty();
            },
            rows -> {
                Double max = value(rows, "SOFR99_IORB_MAX");
                return max != null && max >= 3
                        ? Optional.of("SOFR 99 分位周内最高比 IORB 高 " + String.format("%.1fbp", max) + "，尾部压力显现。") : Optional.<String>empty();
            },
            rows -> {
                WeeklyRow r = rows.get("LIQ_RATIO");
                if (r == null || r.current() == null || r.current() >= 14) return Optional.empty();
                double gap = LiquidityCalcService.round(r.current() - 11);
                String text = gap >= 0
                        ? "准备金比例 " + pct(r.current()) + "，距 11% 警戒线仅 " + pct(gap).replace("%", "") + " 个百分点。"
                        : "准备金比例 " + pct(r.current()) + "，已低于 11% 警戒线 " + pct(-gap).replace("%", "") + " 个百分点。";
                return Optional.of(text);
            },
            rows -> {
                Double v = value(rows, "ONRRP_LAST");
                return v != null && v < 20 ? Optional.of("ON RRP 已降至 " + money(v) + "，缓冲垫基本耗尽。") : Optional.<String>empty();
            },
            rows -> {
                WeeklyRow r = rows.get("TGA_LAST");
                if (r == null || r.change() == null || Math.abs(r.change()) < 20) return Optional.empty();
                return Optional.of(r.change() > 0
                        ? "TGA 较上周增加 " + money(r.change()) + "，抽走准备金。"
                        : "TGA 较上周减少 " + money(-r.change()) + "，向市场释放准备金。");
            },
            rows -> {
                Double sum = value(rows, "SRF_SUM");
                Double max = value(rows, "SRF_MAX");
                return sum != null && sum > 0
                        ? Optional.of("SRF 本周累计使用 " + money(sum) + "，单日最高 " + money(max == null ? 0 : max) + "。") : Optional.<String>empty();
            },
            rows -> {
                Double v = value(rows, "RMP_SUM");
                return v != null && v > 0 ? Optional.of("美联储本周购买短债 " + money(v) + "。") : Optional.<String>empty();
            });

    private List<String> observations(Map<String, WeeklyRow> rows) {
        List<String> out = new ArrayList<>();
        for (Function<Map<String, WeeklyRow>, Optional<String>> rule : RULES) {
            rule.apply(rows).ifPresent(out::add);
            if (out.size() == MAX_OBSERVATIONS) break;
        }
        if (out.isEmpty()) out.add("本周主要指标未触发观察规则。");
        return out;
    }

    private static Double value(Map<String, WeeklyRow> rows, String key) {
        WeeklyRow r = rows.get(key);
        return r == null ? null : r.current();
    }

    private static String bp(double v) {
        return String.format("%+.1fbp", v);
    }

    private static String pct(double v) {
        return String.format("%.2f%%", v);
    }

    /** Billions of dollars in the units the course uses: 万亿 / 亿 / 万美元. */
    static String money(double bn) {
        double abs = Math.abs(bn);
        if (abs >= 1000) return String.format("%.2f 万亿美元", bn / 1000);
        if (abs >= 0.1) return String.format(abs >= 10 ? "%.0f 亿美元" : "%.1f 亿美元", bn * 10);
        return String.format("%.0f 万美元", bn * 100_000);
    }

    // ---- snapshots ----

    public List<SnapshotSummary> listSnapshots() {
        return snapshotRepo.findAllByOrderByWeekEndDesc().stream()
                .map(s -> new SnapshotSummary(s.getId(), s.getWeekEnd(),
                        s.getCommentary() != null && !s.getCommentary().isBlank(), s.getUpdatedAt()))
                .toList();
    }

    public SnapshotDetail getSnapshot(Long id) {
        return toDetail(require(id));
    }

    /** Recomputes the week and freezes it; saving the same week again replaces the snapshot. */
    @Transactional
    public SnapshotDetail saveSnapshot(LocalDate weekEnd, String commentary) {
        WeeklyReport report = report(weekEnd);
        LiquidityWeeklyReport row = snapshotRepo.findByWeekEnd(report.weekEnd()).orElseGet(LiquidityWeeklyReport::new);
        row.setWeekEnd(report.weekEnd());
        try {
            row.setPayload(mapper.writeValueAsString(report));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("无法序列化周报", e);
        }
        row.setCommentary(blankToNull(commentary));
        return toDetail(snapshotRepo.save(row));
    }

    @Transactional
    public SnapshotDetail updateCommentary(Long id, String commentary) {
        LiquidityWeeklyReport row = require(id);
        row.setCommentary(blankToNull(commentary));
        return toDetail(snapshotRepo.save(row));
    }

    @Transactional
    public void deleteSnapshot(Long id) {
        snapshotRepo.delete(require(id));
    }

    private LiquidityWeeklyReport require(Long id) {
        return snapshotRepo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "快照不存在"));
    }

    private SnapshotDetail toDetail(LiquidityWeeklyReport row) {
        try {
            return new SnapshotDetail(row.getId(), row.getWeekEnd(), mapper.readTree(row.getPayload()), row.getCommentary(),
                    row.getCreatedAt(), row.getUpdatedAt());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("快照数据损坏", e);
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
