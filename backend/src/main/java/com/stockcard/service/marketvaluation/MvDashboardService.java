package com.stockcard.service.marketvaluation;

import com.stockcard.entity.MvFactsetReport;
import com.stockcard.repository.MvFactsetReportRepository;
import com.stockcard.repository.MvObservationRepository;
import com.stockcard.service.AppConfigService;
import com.stockcard.service.liquidity.SeriesPoint;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

/** Everything the overview page needs in one response (design §5.6). */
@Service
public class MvDashboardService {

    public record PrevPoint(LocalDate date, double value) {}

    public record Card(String code, String name, String unit, String group, String direction, Double value, LocalDate date,
                       PrevPoint prev, Double change, Double percentile, List<Object[]> spark, boolean stale, boolean estimate,
                       String missing) {}

    public record ProfItem(String code, String name, String unit, Double value, LocalDate date, String quarter, PrevPoint prev,
                           Double change, boolean stale, String missing) {}

    public record Quadrant(String valuation, String earnings, String text) {}

    public record Dashboard(LocalDate asOf, String window, MvStatsService.Temperature temperature, List<Card> cards,
                            Map<String, ProfItem> profitability, Quadrant quadrant, List<MvSyncService.SourceStatus> sources,
                            boolean fredConfigured, boolean syncRunning, boolean hasData) {}

    private record CardDef(String code, String group) {}

    private static final List<CardDef> CARDS = List.of(
            new CardDef("SPX_CAPE_D", "ABSOLUTE"), new CardDef("BUFFETT_D", "ABSOLUTE"), new CardDef("SPX_PE_D", "ABSOLUTE"),
            new CardDef("FS_FWD_PE", "ABSOLUTE"), new CardDef("SPX_PS_D", "ABSOLUTE"), new CardDef("SPX_DY_D", "ABSOLUTE"),
            new CardDef("ERP_REAL_D", "RELATIVE"), new CardDef("ERP_NOM_D", "RELATIVE"), new CardDef("ERP_FWD", "RELATIVE"),
            new CardDef("TIPS10Y", "RELATIVE"),
            new CardDef("RSP_SPY", "STRUCTURE"), new CardDef("VIX", "STRUCTURE"));

    private static final Map<String, String> PROFITABILITY = new LinkedHashMap<>();

    static {
        PROFITABILITY.put("epsYoy", "SPX_EPS_YOY");
        PROFITABILITY.put("netMargin", "SPX_NET_MARGIN");
        PROFITABILITY.put("roe", "SPX_ROE");
        PROFITABILITY.put("profitGdp", "PROFIT_GDP");
        PROFITABILITY.put("fsEpsGrowthQ", "FS_EPS_G_Q");
        PROFITABILITY.put("fsFwdEpsChg13w", "FS_FWD_EPS_CHG_13W");
        PROFITABILITY.put("fsEpsGrowthNextYear", "FS_EPS_G_NY");
    }

    private static final int CARD_HISTORY_DAYS = 400;
    private static final int PROFITABILITY_HISTORY_DAYS = 1200;
    private static final int SPARK_DAYS = 365;
    private static final int SPARK_POINTS = 60;
    private static final double STALE_FACTOR = 1.5;

    /** Valuation level -> [strong, moderate, declining earnings] wording (design §5.6: 6 levels x 3). */
    private static final Map<String, String[]> QUADRANT_TEXT = Map.of(
            "极便宜", new String[]{"估值极低且盈利强劲，具备较大安全边际", "估值极低，盈利温和，安全边际较高", "估值极低，但盈利下滑，需警惕价值陷阱"},
            "偏便宜", new String[]{"估值偏低且盈利高增长，性价比较高", "估值偏低，盈利温和增长", "估值偏低，但盈利下滑，等待盈利企稳"},
            "中性", new String[]{"估值中性，盈利强劲，基本面提供支撑", "估值与盈利大体匹配，没有明显偏离", "估值中性，但盈利下滑，留意估值下修压力"},
            "偏贵", new String[]{"估值偏贵，但盈利强劲可以部分消化", "估值偏贵，盈利增长温和，容错空间有限", "估值偏贵且盈利下滑，风险收益比下降"},
            "昂贵", new String[]{"估值昂贵，但盈利高增长提供一定支撑", "估值昂贵，盈利增长温和，对回调较敏感", "估值昂贵且盈利下滑，需高度警惕"},
            "历史极端", new String[]{"估值处于历史极端，即使盈利强劲也需谨慎", "估值处于历史极端，盈利不足以支撑，回撤风险高", "估值处于历史极端且盈利下滑，风险极高"});

    private final MvCalcService calc;
    private final MvStatsService stats;
    private final MvSyncService syncService;
    private final MvObservationRepository obsRepo;
    private final MvFactsetReportRepository factsetRepo;
    private final AppConfigService config;
    private final Clock clock;

    @Autowired
    public MvDashboardService(MvCalcService calc, MvStatsService stats, MvSyncService syncService, MvObservationRepository obsRepo,
                              MvFactsetReportRepository factsetRepo, AppConfigService config) {
        this(calc, stats, syncService, obsRepo, factsetRepo, config, Clock.system(ZoneId.of("Asia/Shanghai")));
    }

    MvDashboardService(MvCalcService calc, MvStatsService stats, MvSyncService syncService, MvObservationRepository obsRepo,
                       MvFactsetReportRepository factsetRepo, AppConfigService config, Clock clock) {
        this.calc = calc;
        this.stats = stats;
        this.syncService = syncService;
        this.obsRepo = obsRepo;
        this.factsetRepo = factsetRepo;
        this.config = config;
        this.clock = clock;
    }

    public Dashboard dashboard(String windowText) {
        MvStatsService.Window window = MvStatsService.Window.parse(windowText);
        LocalDate today = LocalDate.now(clock);
        boolean fred = !config.resolveFredApiKey().isBlank();
        MvCalcService.Session session = calc.session();

        MvStatsService.Temperature temperature = stats.temperature(session, window, today, fred);
        List<Card> cards = new ArrayList<>();
        for (CardDef def : CARDS) cards.add(card(session, def, today, window, fred));
        Map<String, ProfItem> profitability = new LinkedHashMap<>();
        PROFITABILITY.forEach((key, code) -> profitability.put(key, profItem(session, code, today, fred)));

        SeriesPoint spx = MvCalcService.last(session.get("PX_SPX", today.minusDays(CARD_HISTORY_DAYS)));
        LocalDate asOf = spx != null ? spx.date() : cards.stream().map(Card::date).filter(d -> d != null).max(LocalDate::compareTo).orElse(null);
        return new Dashboard(asOf, window.wire(), temperature, cards, profitability, quadrant(temperature, profitability),
                syncService.sourceStatuses(), fred, syncService.isRunning(), obsRepo.count() > 0);
    }

    private Card card(MvCalcService.Session session, CardDef def, LocalDate today, MvStatsService.Window window, boolean fred) {
        MvCatalog.Info info = MvCatalog.find(def.code()).orElseThrow();
        List<SeriesPoint> series = session.get(def.code(), today.minusDays(CARD_HISTORY_DAYS));
        SeriesPoint last = MvCalcService.last(series);
        if (last == null) {
            return new Card(def.code(), info.name(), info.unit(), def.group(), info.direction().name(), null, null, null, null, null,
                    List.of(), false, info.estimate(), missingReason(info, fred));
        }
        SeriesPoint prev = MvCalcService.asOf(series, last.date().minusDays(30));
        Double percentile = null;
        if (info.direction() != MvSeries.Direction.NONE) {
            MvStatsService.Percentile p = stats.percentileOf(session, def.code(), last.value(), last.date(), window);
            if (p.enough() && p.percentile() != null) {
                percentile = info.direction() == MvSeries.Direction.LOWER_IS_EXPENSIVE ? 100 - p.percentile() : p.percentile();
            }
        }
        return new Card(def.code(), info.name(), info.unit(), def.group(), info.direction().name(), last.value(), last.date(),
                prev == null ? null : new PrevPoint(prev.date(), prev.value()), prev == null ? null : last.value() - prev.value(),
                percentile, spark(series, last.date()), isStale(last.date(), info, today), info.estimate(), null);
    }

    private ProfItem profItem(MvCalcService.Session session, String code, LocalDate today, boolean fred) {
        MvCatalog.Info info = MvCatalog.find(code).orElseThrow();
        List<SeriesPoint> series = session.get(code, today.minusDays(PROFITABILITY_HISTORY_DAYS));
        SeriesPoint last = MvCalcService.last(series);
        if (last == null) {
            return new ProfItem(code, info.name(), info.unit(), null, null, null, null, null, false, missingReason(info, fred));
        }
        SeriesPoint prev = series.size() > 1 ? series.get(series.size() - 2) : null;
        return new ProfItem(code, info.name(), info.unit(), last.value(), last.date(), fiscalQuarter(code, last.date()),
                prev == null ? null : new PrevPoint(prev.date(), prev.value()), prev == null ? null : last.value() - prev.value(),
                isStale(last.date(), info, today), null);
    }

    /** FS_EPS_G_Q is a statement about one fiscal quarter, which only the weekly bookkeeping knows. */
    private String fiscalQuarter(String code, LocalDate date) {
        if (!"FS_EPS_G_Q".equals(code)) return null;
        return factsetRepo.findByWeekFridayGreaterThanEqual(date.minusDays(7)).stream()
                .filter(r -> date.equals(r.getReportDate()))
                .map(MvFactsetReport::getFiscalQuarter)
                .filter(q -> q != null)
                .findFirst().orElse(null);
    }

    private static String missingReason(MvCatalog.Info info, boolean fredConfigured) {
        return info.needsFred() && !fredConfigured ? "NO_FRED_KEY" : "NO_DATA";
    }

    private static boolean isStale(LocalDate date, MvCatalog.Info info, LocalDate today) {
        return date.isBefore(today.minusDays((long) (info.typicalLagDays() * STALE_FACTOR)));
    }

    /** The last year of observations, one per week (the week's last), at most 60 points. */
    static List<Object[]> spark(List<SeriesPoint> series, LocalDate end) {
        TreeMap<LocalDate, SeriesPoint> byWeek = new TreeMap<>();
        for (SeriesPoint p : series) {
            if (p.date().isBefore(end.minusDays(SPARK_DAYS))) continue;
            byWeek.put(p.date().minusDays(p.date().getDayOfWeek().getValue() - 1L), p);
        }
        List<Object[]> out = new ArrayList<>();
        byWeek.values().forEach(p -> out.add(new Object[]{p.date().toString(), p.value()}));
        return out.size() > SPARK_POINTS ? new ArrayList<>(out.subList(out.size() - SPARK_POINTS, out.size())) : out;
    }

    /** Earnings strength comes from FactSet's next-year growth when available, otherwise from the trailing EPS growth. */
    static Quadrant quadrant(MvStatsService.Temperature temperature, Map<String, ProfItem> profitability) {
        if (temperature.level() == null) return null;
        Double growth = Optional.ofNullable(profitability.get("fsEpsGrowthNextYear")).map(ProfItem::value)
                .orElseGet(() -> Optional.ofNullable(profitability.get("epsYoy")).map(ProfItem::value).orElse(null));
        if (growth == null) return new Quadrant(temperature.level(), null, "估值" + temperature.level() + "，盈利数据暂缺");
        int idx = growth >= 10 ? 0 : growth >= 0 ? 1 : 2;
        String earnings = idx == 0 ? "强" : idx == 1 ? "温和" : "下滑";
        return new Quadrant(temperature.level(), earnings, QUADRANT_TEXT.get(temperature.level())[idx]);
    }
}
