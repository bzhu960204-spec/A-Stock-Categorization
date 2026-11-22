package com.stockcard.service.liquidity;

import com.stockcard.entity.LiquidityManualSeries;
import com.stockcard.repository.LiquidityObservationRepository;
import com.stockcard.service.AppConfigService;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Assembles the overview page: one card per core indicator plus the data-source health (design §5.7 /dashboard). */
@Service
public class LiquidityDashboardService {

    public record Card(String code, String name, String unit, int row, SeriesPoint latest, SeriesPoint prevWeek,
                       Double change, LiquidityStatus status, List<SeriesPoint> spark, boolean needsFredKey) {}

    public record Dashboard(LocalDate asOf, LiquidityStatus overallStatus, List<Card> cards,
                            List<LiquiditySyncService.SourceStatus> sources, boolean fredConfigured,
                            boolean syncRunning, long observationCount) {}

    /** The five indicators that make up the overall status (design §3.4). */
    static final Set<String> OVERALL_CODES = Set.of("SOFR_IORB", "TGCR_IORB", "SOFR99_IORB", "LIQ_RATIO", "SRF_AMT");

    private static final String RMP_4W = "RMP_4W";
    private static final int SPARK_POINTS = 60;
    /** Long enough for 60 weekly observations of LIQ_RATIO. */
    private static final int HISTORY_DAYS = 450;
    private static final int RMP_WINDOW_DAYS = 28;

    private static final List<String> ROW_1 = List.of("SOFR_IORB", "TGCR_IORB", "SOFR_EFFR", "SOFR99_IORB");
    private static final List<String> ROW_2 = List.of("LIQ_RATIO", "RESERVES", "ONRRP_AMT", "TGA");
    private static final List<String> ROW_3 = List.of("SRF_AMT", RMP_4W, "HY_OAS");

    private final LiquidityCalcService calc;
    private final LiquidityThresholdService thresholds;
    private final LiquidityManualService manual;
    private final LiquiditySyncService sync;
    private final LiquidityObservationRepository obsRepo;
    private final AppConfigService config;
    private final Clock clock;

    public LiquidityDashboardService(LiquidityCalcService calc, LiquidityThresholdService thresholds, LiquidityManualService manual,
                                     LiquiditySyncService sync, LiquidityObservationRepository obsRepo, AppConfigService config) {
        this.calc = calc;
        this.thresholds = thresholds;
        this.manual = manual;
        this.sync = sync;
        this.obsRepo = obsRepo;
        this.config = config;
        this.clock = Clock.systemDefaultZone();
    }

    public Dashboard dashboard() {
        LocalDate today = LocalDate.now(clock);
        LocalDate from = today.minusDays(HISTORY_DAYS);
        boolean fredConfigured = !config.resolveFredApiKey().isBlank();
        Map<String, List<SeriesPoint>> cache = new HashMap<>();
        Map<String, ThresholdRule> rules = thresholds.effectiveRules();

        List<Card> cards = new ArrayList<>();
        addCards(cards, ROW_1, 1, from, today, cache, rules, fredConfigured);
        addCards(cards, ROW_2, 2, from, today, cache, rules, fredConfigured);
        addCards(cards, ROW_3, 3, from, today, cache, rules, fredConfigured);
        List<String> manualCodes = manual.list().stream().map(LiquidityManualSeries::getCode).toList();
        addCards(cards, manualCodes, 3, from, today, cache, rules, fredConfigured);

        LiquidityStatus overall = LiquidityStatus.NONE;
        LocalDate asOf = null;
        for (Card c : cards) {
            if (OVERALL_CODES.contains(c.code())) overall = LiquidityStatus.worse(overall, c.status());
            if (c.latest() != null && !c.code().equals(RMP_4W) && (asOf == null || c.latest().date().isAfter(asOf))) {
                asOf = c.latest().date();
            }
        }
        return new Dashboard(asOf, overall, cards, sync.sourceStatuses(), fredConfigured, sync.isRunning(), obsRepo.count());
    }

    private void addCards(List<Card> out, List<String> codes, int row, LocalDate from, LocalDate today,
                          Map<String, List<SeriesPoint>> cache, Map<String, ThresholdRule> rules, boolean fredConfigured) {
        for (String code : codes) {
            out.add(code.equals(RMP_4W) ? rmpCard(row, from, today, cache) : card(code, row, from, today, cache, rules, fredConfigured));
        }
    }

    private Card card(String code, int row, LocalDate from, LocalDate today, Map<String, List<SeriesPoint>> cache,
                      Map<String, ThresholdRule> rules, boolean fredConfigured) {
        String[] meta = nameAndUnit(code);
        return buildCard(code, meta[0], meta[1], row, calc.series(code, from, today, cache), rules.get(code), fredConfigured);
    }

    /** One indicator card from its points (oldest first); shared with the QE radar so both pages draw cards the same way. */
    public static Card buildCard(String code, String name, String unit, int row, List<SeriesPoint> points,
                                 ThresholdRule rule, boolean fredConfigured) {
        SeriesPoint latest = points.isEmpty() ? null : points.get(points.size() - 1);
        SeriesPoint prev = latest == null ? null : asOf(points, latest.date().minusDays(7));
        LiquidityStatus status = rule == null || latest == null ? LiquidityStatus.NONE : rule.evaluate(latest.value());
        boolean needsFred = latest == null && !fredConfigured && LiquiditySeries.find(code).map(LiquiditySeries::needsFred).orElse(false);
        List<SeriesPoint> spark = points.subList(Math.max(0, points.size() - SPARK_POINTS), points.size());
        return new Card(code, name, unit, row, latest, prev, change(latest, prev), status, spark, needsFred);
    }

    /** Bills bought by the Fed over the last 4 weeks (RMP): a rolling sum, sampled weekly for the sparkline. */
    private Card rmpCard(int row, LocalDate from, LocalDate today, Map<String, List<SeriesPoint>> cache) {
        List<SeriesPoint> raw = calc.series("RMP_BILLS", from, today, cache);
        SeriesPoint latest = new SeriesPoint(today, rollingSum(raw, today));
        SeriesPoint prev = new SeriesPoint(today.minusDays(7), rollingSum(raw, today.minusDays(7)));
        List<SeriesPoint> spark = new ArrayList<>();
        for (int weeks = 25; weeks >= 0; weeks--) {
            LocalDate d = today.minusDays(7L * weeks);
            spark.add(new SeriesPoint(d, rollingSum(raw, d)));
        }
        return new Card(RMP_4W, "短债购买（近 4 周合计）", "bn", row, latest, prev, change(latest, prev), LiquidityStatus.NONE, spark, false);
    }

    private static double rollingSum(List<SeriesPoint> points, LocalDate end) {
        double sum = LiquidityCalcService.window(points, end.minusDays(RMP_WINDOW_DAYS - 1L), end)
                .stream().mapToDouble(SeriesPoint::value).sum();
        return LiquidityCalcService.round(sum);
    }

    /** The last observation on or before {@code date}. */
    private static SeriesPoint asOf(List<SeriesPoint> points, LocalDate date) {
        SeriesPoint found = null;
        for (SeriesPoint p : points) {
            if (p.date().isAfter(date)) break;
            found = p;
        }
        return found;
    }

    private static Double change(SeriesPoint latest, SeriesPoint prev) {
        return latest == null || prev == null ? null : LiquidityCalcService.round(latest.value() - prev.value());
    }

    private String[] nameAndUnit(String code) {
        return LiquiditySeries.find(code)
                .map(s -> new String[]{s.label(), s.unit()})
                .orElseGet(() -> manual.list().stream().filter(m -> m.getCode().equals(code)).findFirst()
                        .map(m -> new String[]{m.getName(), m.getUnit()}).orElse(new String[]{code, ""}));
    }
}
