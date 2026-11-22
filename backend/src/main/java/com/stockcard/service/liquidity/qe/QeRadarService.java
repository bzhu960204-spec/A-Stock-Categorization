package com.stockcard.service.liquidity.qe;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockcard.entity.FedTextEvent;
import com.stockcard.repository.FedTextEventRepository;
import com.stockcard.repository.QeRadarAlertRepository;
import com.stockcard.service.AppConfigService;
import com.stockcard.service.liquidity.LiquidityCalcService;
import com.stockcard.service.liquidity.LiquidityDashboardService.Card;
import com.stockcard.service.liquidity.LiquidityDashboardService;
import com.stockcard.service.liquidity.LiquiditySeries;
import com.stockcard.service.liquidity.LiquidityStatus;
import com.stockcard.service.liquidity.LiquidityThresholdService;
import com.stockcard.service.liquidity.SeriesPoint;
import com.stockcard.service.liquidity.ThresholdRule;
import com.stockcard.service.liquidity.qe.QeStageEngine.StageResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.Set;
import java.util.TreeMap;

/** Assembles the QE radar: current stage and likelihood, stage history, texts and historical replays (qe-radar §5.4). */
@Service
public class QeRadarService {

    static final LocalDate HISTORY_START = LocalDate.of(2007, 1, 1);
    /** Before this the "ample reserves" regime did not exist, so LIQ_RATIO is not comparable. */
    static final LocalDate LIQ_RATIO_FROM = LocalDate.of(2018, 4, 1);
    private static final int CARD_HISTORY_DAYS = 450;
    private static final int TEXT_SIGNAL_DAYS = 60;
    private static final int ANNOUNCED_QE_DAYS = 45;
    private static final int ANNOUNCED_EMERGENCY_DAYS = 14;
    private static final int MAX_TEXTS = 500;
    private static final int LATEST_TEXTS = 5;
    private static final String TEXT_SIGNAL = "TEXT_SIGNAL";

    static final List<String> PRESSURE = List.of("STLFSI4", "NFCI", "VIX", "HY_OAS", "SAHM", "SOFR_IORB", "SOFR99_IORB", "LIQ_RATIO");
    static final List<String> INTENT = List.of("CUT_PRICING", "FFTR_HIGH", "RATE_CHANGE_6M");
    static final List<String> ACTION = List.of("SOMA_13W", "SOMA_LONG_13W", "QE_OPS_28D", "PRIMARY_CREDIT_4W", "CB_SWAPS_4W",
            "NONSEC_4W", "SRF_AMT", "NET_LIQ_13W");
    /** Indicators the replay measures lead time for (every threshold in qe-radar §3.5 except the display-only net liquidity). */
    private static final List<String> LEAD_CODES = List.of("STLFSI4", "NFCI", "VIX", "HY_OAS", "SAHM", "CUT_PRICING", "FFTR_HIGH",
            "RATE_CHANGE_6M", "SOMA_13W", "SOMA_LONG_13W", "QE_OPS_28D", "PRIMARY_CREDIT_4W", "CB_SWAPS_4W", "NONSEC_4W");
    private static final List<String> REPLAY_SERIES = List.of("SOMA_TOTAL", "SOMA_LONG_13W", "NONSEC_ASSETS", "STLFSI4", "VIX", "HY_OAS",
            "CUT_PRICING", "FFTR_HIGH", "PRIMARY_CREDIT", "CB_SWAPS", "SRF_AMT");
    private static final int LEAD_WINDOW_DAYS = 180;

    // ---- output records (serialised as the REST payloads) ----

    public record Announced(int level, LocalDate docDate, String title) {}

    public record StageView(int level, String name, List<String> triggers, LocalDate since, Announced announced) {}

    public record LikelihoodView(String level, List<String> reasons) {}

    public record Layers(List<Card> pressure, List<Card> intent, List<Card> action) {}

    public record TextSummary(Long id, LocalDate docDate, String title, String url, String docType, List<String> categories,
                              double stance, boolean hasDirectiveChanges) {}

    public record RadarView(LocalDate asOf, StageView stage, LikelihoodView likelihood, List<String> nextSteps, Layers layers,
                            List<TextSummary> latestTexts, long unreadAlerts, boolean fredConfigured) {}

    public record Segment(LocalDate from, LocalDate to, int level, List<String> triggers) {}

    public record TextDetail(Long id, LocalDate docDate, String title, String url, String docType, List<String> categories,
                             double stance, String body, JsonNode hits, String directive, JsonNode directiveChanges) {}

    public record StageBand(LocalDate from, LocalDate to, int level) {}

    public record Lead(String code, String name, LocalDate firstYellow, LocalDate firstRed, Long leadDaysYellow, Long leadDaysRed) {}

    public record ReplayText(Long id, LocalDate docDate, String title, List<String> categories) {}

    public record Replay(QeEpisodes.Episode episode, LocalDate from, LocalDate to, List<StageBand> stages,
                         Map<String, List<Object[]>> series, List<Lead> leads, List<ReplayText> texts) {}

    /** The stage and likelihood on one date; used by the radar, the alerts and the weekly report. */
    public record Assessment(LocalDate asOf, StageResult stage, Announced announced, QeLikelihood.Result likelihood,
                             List<String> nextSteps, List<QeLikelihood.Signal> signals, TextSignal text) {}

    /** The Fed-text indicator: red = a purchase programme was announced, yellow = any other easing language, in the last 60 days. */
    public record TextSignal(LiquidityStatus status, FedTextEventRepository.Summary doc, List<String> categories) {}

    private record Data(Map<String, List<SeriesPoint>> series, Map<String, NavigableMap<LocalDate, Double>> byDate,
                        List<FedTextEventRepository.Summary> texts, QeStageEngine.Inputs inputs) {}

    private final LiquidityCalcService calc;
    private final LiquidityThresholdService thresholds;
    private final FedTextEventRepository textRepo;
    private final QeRadarAlertRepository alertRepo;
    private final AppConfigService config;
    private final ObjectMapper mapper;
    private final Clock clock;

    @Autowired
    public QeRadarService(LiquidityCalcService calc, LiquidityThresholdService thresholds, FedTextEventRepository textRepo,
                          QeRadarAlertRepository alertRepo, AppConfigService config, ObjectMapper mapper) {
        this(calc, thresholds, textRepo, alertRepo, config, mapper, Clock.systemDefaultZone());
    }

    QeRadarService(LiquidityCalcService calc, LiquidityThresholdService thresholds, FedTextEventRepository textRepo,
                   QeRadarAlertRepository alertRepo, AppConfigService config, ObjectMapper mapper, Clock clock) {
        this.calc = calc;
        this.thresholds = thresholds;
        this.textRepo = textRepo;
        this.alertRepo = alertRepo;
        this.config = config;
        this.mapper = mapper;
        this.clock = clock;
    }

    // ---- current radar ----

    public RadarView current() {
        LocalDate today = LocalDate.now(clock);
        Data data = load(today);
        Map<String, ThresholdRule> rules = thresholds.effectiveRules();
        boolean fred = fredConfigured();
        Assessment a = assess(data, today, rules, fred);

        StageView stage = new StageView(a.stage().level(), a.stage().name(), a.stage().triggers(),
                sinceOf(data, today, rules, a.stage().level()), a.announced());

        LocalDate cardsFrom = today.minusDays(CARD_HISTORY_DAYS);
        List<Card> pressure = cards(PRESSURE, 1, data, cardsFrom, rules, fred);
        List<Card> intent = new ArrayList<>(cards(INTENT, 2, data, cardsFrom, rules, fred));
        intent.add(textCard(a.text()));
        List<Card> action = cards(ACTION, 3, data, cardsFrom, rules, fred);

        LocalDate asOf = action.stream().filter(c -> c.latest() != null).map(c -> c.latest().date()).max(Comparator.naturalOrder())
                .orElse(null);
        List<TextSummary> latest = data.texts().stream().limit(LATEST_TEXTS).map(QeRadarService::toSummary).toList();
        return new RadarView(asOf, stage, new LikelihoodView(a.likelihood().level().name(), a.likelihood().reasons()), a.nextSteps(),
                new Layers(pressure, intent, action), latest, alertRepo.countByAcknowledgedFalse(), fred);
    }

    /** Stage, likelihood and next steps as of {@code date}, using only data and texts up to that date. */
    public Assessment assessAt(LocalDate date) {
        return assess(load(date), date, thresholds.effectiveRules(), fredConfigured());
    }

    private Assessment assess(Data data, LocalDate t, Map<String, ThresholdRule> rules, boolean fred) {
        StageResult stage = QeStageEngine.evaluate(data.inputs(), t, rules);

        List<QeLikelihood.Signal> signals = new ArrayList<>();
        Map<String, LiquidityStatus> statuses = new HashMap<>();
        for (String code : PRESSURE) signals.add(signal(code, true, data, t, rules, statuses));
        for (String code : INTENT) signals.add(signal(code, false, data, t, rules, statuses));
        TextSignal text = textSignal(data.texts(), t);
        signals.add(new QeLikelihood.Signal(TEXT_SIGNAL, false, text.status(), textReason(text)));
        statuses.put(TEXT_SIGNAL, text.status());

        QeLikelihood.Result likelihood = QeLikelihood.assess(signals, !fred);
        return new Assessment(t, stage, announced(data.texts(), t, stage.level()), likelihood,
                QeLikelihood.nextSteps(stage.level(), statuses, signals), signals, text);
    }

    private QeLikelihood.Signal signal(String code, boolean pressure, Data data, LocalDate t, Map<String, ThresholdRule> rules,
                                       Map<String, LiquidityStatus> statuses) {
        Map.Entry<LocalDate, Double> point = data.byDate().getOrDefault(code, new TreeMap<>()).floorEntry(t);
        ThresholdRule rule = rules.get(code);
        boolean comparable = !(code.equals("LIQ_RATIO") && t.isBefore(LIQ_RATIO_FROM));
        LiquidityStatus status = point == null || rule == null || !comparable ? LiquidityStatus.NONE : rule.evaluate(point.getValue());
        statuses.put(code, status);
        String reason = point == null ? code : LiquiditySeries.find(code).map(LiquiditySeries::label).orElse(code) + " "
                + format(point.getValue(), LiquiditySeries.find(code).map(LiquiditySeries::unit).orElse(""))
                + (status == LiquidityStatus.RED ? "（红）" : "（黄）");
        return new QeLikelihood.Signal(code, pressure, status, reason);
    }

    static TextSignal textSignal(List<FedTextEventRepository.Summary> texts, LocalDate t) {
        List<FedTextEventRepository.Summary> window = texts.stream()
                .filter(s -> !s.getDocDate().isAfter(t) && !s.getDocDate().isBefore(t.minusDays(TEXT_SIGNAL_DAYS)))
                .filter(s -> !FedDocType.MINUTES.name().equals(s.getDocType())).toList();
        if (window.isEmpty()) return new TextSignal(LiquidityStatus.NONE, null, List.of());
        Set<String> categories = new LinkedHashSet<>();
        window.forEach(s -> categories.addAll(categoriesOf(s.getCategories())));
        LiquidityStatus status = categories.contains(FedTextClassifier.QE_PURCHASE) ? LiquidityStatus.RED
                : categories.stream().anyMatch(c -> Set.of(FedTextClassifier.RMP, FedTextClassifier.QT_END,
                        FedTextClassifier.EMERGENCY, FedTextClassifier.CUT).contains(c)) ? LiquidityStatus.YELLOW : LiquidityStatus.GREEN;
        FedTextEventRepository.Summary doc = window.stream().filter(s -> !categoriesOf(s.getCategories()).isEmpty()).findFirst()
                .orElse(window.get(0));
        return new TextSignal(status, doc, List.copyOf(categories));
    }

    private static String textReason(TextSignal text) {
        return "联储文本（近 " + TEXT_SIGNAL_DAYS + " 天）命中 " + String.join("、", text.categories())
                + (text.status() == LiquidityStatus.RED ? "（红）" : "（黄）");
    }

    private Card textCard(TextSignal text) {
        SeriesPoint latest = text.doc() == null ? null : new SeriesPoint(text.doc().getDocDate(), text.doc().getStance());
        return new Card(TEXT_SIGNAL, "联储文本信号", "stance", 2, latest, null, null, text.status(), List.of(), false);
    }

    /** "Announced, not yet executed": text says L4 / L3 but the data has not caught up. It never changes the level. */
    static Announced announced(List<FedTextEventRepository.Summary> texts, LocalDate t, int level) {
        if (level < 4) {
            Announced qe = newest(texts, t, ANNOUNCED_QE_DAYS, FedTextClassifier.QE_PURCHASE, 4);
            if (qe != null) return qe;
        }
        return level < 3 ? newest(texts, t, ANNOUNCED_EMERGENCY_DAYS, FedTextClassifier.EMERGENCY, 3) : null;
    }

    private static Announced newest(List<FedTextEventRepository.Summary> texts, LocalDate t, int days, String category, int level) {
        return texts.stream()
                .filter(s -> !s.getDocDate().isAfter(t) && !s.getDocDate().isBefore(t.minusDays(days)))
                .filter(s -> !FedDocType.MINUTES.name().equals(s.getDocType()))
                .filter(s -> categoriesOf(s.getCategories()).contains(category))
                .findFirst().map(s -> new Announced(level, s.getDocDate(), s.getTitle())).orElse(null);
    }

    private List<Card> cards(List<String> codes, int row, Data data, LocalDate from, Map<String, ThresholdRule> rules, boolean fred) {
        List<Card> out = new ArrayList<>();
        for (String code : codes) {
            List<SeriesPoint> points = data.series().getOrDefault(code, List.of()).stream().filter(p -> !p.date().isBefore(from)).toList();
            LiquiditySeries meta = LiquiditySeries.find(code).orElseThrow();
            out.add(LiquidityDashboardService.buildCard(code, meta.label(), meta.unit(), row, points, rules.get(code), fred));
        }
        return out;
    }

    // ---- stage history ----

    public List<Segment> stageHistory(LocalDate from) {
        LocalDate today = LocalDate.now(clock);
        Data data = load(today);
        Map<String, ThresholdRule> rules = thresholds.effectiveRules();
        return segments(QeStageEngine.history(data.inputs(), evaluationDates(data, from, today, false), rules));
    }

    /** Weekly SOMA dates that have a 13-week change, plus {@code to} itself when asked (so "today" can differ from the last week). */
    private static List<LocalDate> evaluationDates(Data data, LocalDate from, LocalDate to, boolean includeTo) {
        List<LocalDate> dates = new ArrayList<>(data.inputs().soma13w().subMap(from, true, to, true).keySet());
        if (includeTo && (dates.isEmpty() || dates.get(dates.size() - 1).isBefore(to))) dates.add(to);
        return dates;
    }

    static List<Segment> segments(List<StageResult> results) {
        List<Segment> out = new ArrayList<>();
        for (StageResult r : results) {
            Segment last = out.isEmpty() ? null : out.get(out.size() - 1);
            if (last != null && last.level() == r.level()) {
                out.set(out.size() - 1, new Segment(last.from(), r.asOf(), last.level(), last.triggers()));
            } else {
                out.add(new Segment(r.asOf(), r.asOf(), r.level(), r.triggers()));
            }
        }
        return out;
    }

    /** Start of the unbroken run at {@code level} that ends at {@code today}. */
    private LocalDate sinceOf(Data data, LocalDate today, Map<String, ThresholdRule> rules, int level) {
        List<Segment> segs = segments(QeStageEngine.history(data.inputs(), evaluationDates(data, HISTORY_START, today, true), rules));
        if (segs.isEmpty()) return null;
        Segment last = segs.get(segs.size() - 1);
        return last.level() == level ? last.from() : today;
    }

    // ---- texts ----

    public List<TextSummary> texts(int limit) {
        return textRepo.findAllByOrderByDocDateDescIdDesc(PageRequest.of(0, Math.max(1, Math.min(limit, MAX_TEXTS))))
                .stream().map(QeRadarService::toSummary).toList();
    }

    public TextDetail text(Long id) {
        FedTextEvent e = textRepo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "文本不存在"));
        return new TextDetail(e.getId(), e.getDocDate(), e.getTitle(), e.getUrl(), e.getDocType(), categoriesOf(e.getCategories()),
                e.getStance(), e.getBody(), readJson(e.getHits()), e.getDirective(),
                e.getDirectiveChanges() == null ? null : readJson(e.getDirectiveChanges()));
    }

    private JsonNode readJson(String json) {
        try {
            return mapper.readTree(json);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("联储文本数据损坏", e);
        }
    }

    private static TextSummary toSummary(FedTextEventRepository.Summary s) {
        return new TextSummary(s.getId(), s.getDocDate(), s.getTitle(), s.getUrl(), s.getDocType(), categoriesOf(s.getCategories()),
                s.getStance(), s.getDirectiveChanges() != null && !s.getDirectiveChanges().isBlank());
    }

    static List<String> categoriesOf(String csv) {
        return csv == null || csv.isBlank() ? List.of() : Arrays.stream(csv.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    // ---- replay ----

    public List<QeEpisodes.Episode> episodes() {
        return QeEpisodes.ALL;
    }

    public Replay replay(String id) {
        QeEpisodes.Episode ep = QeEpisodes.find(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "未知事件: " + id));
        LocalDate from = ep.windowFrom();
        LocalDate to = ep.windowTo();
        LocalDate today = LocalDate.now(clock);
        LocalDate end = to.isAfter(today) ? today : to;
        LocalDate first = ep.keyDates().get(0);
        Map<String, ThresholdRule> rules = thresholds.effectiveRules();

        Data data = load(end);
        List<StageBand> stages = segments(QeStageEngine.history(data.inputs(), evaluationDates(data, from, end, false), rules)).stream()
                .map(s -> new StageBand(s.from(), s.to(), s.level())).toList();

        Set<String> codes = new LinkedHashSet<>(REPLAY_SERIES);
        codes.addAll(LEAD_CODES);
        Map<String, List<SeriesPoint>> window = calc.getSeries(codes, from, end);

        Map<String, List<Object[]>> series = new LinkedHashMap<>();
        for (String code : REPLAY_SERIES) {
            List<SeriesPoint> points = window.getOrDefault(code, List.of());
            if (points.isEmpty()) continue;
            series.put(code, points.stream().map(p -> new Object[]{p.date().toString(), p.value()}).toList());
        }

        List<Lead> leads = new ArrayList<>();
        for (String code : LEAD_CODES) {
            ThresholdRule rule = rules.get(code);
            if (rule == null) continue;
            LocalDate yellow = null;
            LocalDate red = null;
            for (SeriesPoint p : window.getOrDefault(code, List.of())) {
                if (p.date().isBefore(first.minusDays(LEAD_WINDOW_DAYS)) || p.date().isAfter(first)) continue;
                LiquidityStatus s = rule.evaluate(p.value());
                if (yellow == null && (s == LiquidityStatus.YELLOW || s == LiquidityStatus.RED)) yellow = p.date();
                if (red == null && s == LiquidityStatus.RED) red = p.date();
            }
            leads.add(new Lead(code, LiquiditySeries.find(code).map(LiquiditySeries::label).orElse(code), yellow, red,
                    yellow == null ? null : ChronoUnit.DAYS.between(yellow, first), red == null ? null : ChronoUnit.DAYS.between(red, first)));
        }
        leads.sort(Comparator.comparing(Lead::leadDaysYellow, Comparator.nullsLast(Comparator.reverseOrder())));

        List<ReplayText> texts = textRepo.findByDocDateBetweenOrderByDocDateDescIdDesc(from, to).stream()
                .filter(s -> !categoriesOf(s.getCategories()).isEmpty())
                .map(s -> new ReplayText(s.getId(), s.getDocDate(), s.getTitle(), categoriesOf(s.getCategories()))).toList();
        return new Replay(ep, from, to, stages, series, leads, texts);
    }

    // ---- loading / formatting ----

    private Data load(LocalDate to) {
        Set<String> codes = new LinkedHashSet<>();
        codes.addAll(PRESSURE);
        codes.addAll(INTENT);
        codes.addAll(ACTION);
        Map<String, List<SeriesPoint>> series = calc.getSeries(codes, HISTORY_START, to);
        Map<String, NavigableMap<LocalDate, Double>> byDate = new HashMap<>();
        series.forEach((code, points) -> {
            TreeMap<LocalDate, Double> m = new TreeMap<>();
            points.forEach(p -> m.put(p.date(), p.value()));
            byDate.put(code, m);
        });
        List<FedTextEventRepository.Summary> texts = textRepo.findAllByOrderByDocDateDescIdDesc(PageRequest.of(0, MAX_TEXTS)).stream()
                .filter(s -> !s.getDocDate().isAfter(to)).toList();
        return new Data(series, byDate, texts, QeStageEngine.Inputs.of(series));
    }

    private boolean fredConfigured() {
        return !config.resolveFredApiKey().isBlank();
    }

    static String format(double v, String unit) {
        return switch (unit) {
            case "bp" -> String.format("%+.1fbp", v);
            case "%" -> String.format("%.2f%%", v);
            case "bn" -> String.format("%+.1f bn", v);
            default -> String.format("%.2f", v);
        };
    }
}
