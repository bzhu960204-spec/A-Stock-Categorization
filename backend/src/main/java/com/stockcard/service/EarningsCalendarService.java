package com.stockcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockcard.entity.EarningsCalendarEntry;
import com.stockcard.entity.EarningsMonthFetch;
import com.stockcard.repository.EarningsCalendarEntryRepository;
import com.stockcard.repository.EarningsMonthFetchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Consumer;
import java.util.logging.Logger;

/**
 * 美股财报日历服务：从 Nasdaq 官方 API 按月拉取财报，过滤大盘股，
 * 标记 S&P 500 成分股与板块，并按月缓存到数据库。
 * 移植自 Stock Valuation 项目的 earnings_fetcher.py。
 */
@Service
@RequiredArgsConstructor
public class EarningsCalendarService {

    private static final Logger logger = Logger.getLogger(EarningsCalendarService.class.getName());

    private final EarningsCalendarEntryRepository entryRepo;
    private final EarningsMonthFetchRepository monthRepo;

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    // ── 筛选阈值 ──────────────────────────────────────────────────────────────
    private static final long MIN_MARKET_CAP = 20_000_000_000L; // 200 亿美元
    private static final int MIN_ESTIMATES = 3;                  // 至少 3 个分析师覆盖

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;

    // ── 板块内存缓存 ──────────────────────────────────────────────────────────
    private final Map<String, String> sectorCache = new HashMap<>();

    // ══════════════════════════════════════════════════════════════════════
    //  对外 API
    // ══════════════════════════════════════════════════════════════════════

    /** 返回所有已缓存的财报日历数据 + 月份拉取记录 + 近 7 天 watchlist。 */
    public Map<String, Object> getCalendar() {
        List<EarningsCalendarEntry> all = entryRepo.findAll();
        return buildResponse(all);
    }

    /**
     * 流式拉取指定月份的财报数据。每处理完一个交易日回调一次 progress。
     * emit 回调格式见控制器。
     */
    public void streamMonth(int year, int month, Consumer<Map<String, Object>> emit) {
        Set<String> sp500 = SP500_FALLBACK;
        YearMonth ym = YearMonth.of(year, month);
        String monthKey = String.format("%04d-%02d", year, month);

        List<LocalDate> tradingDays = new ArrayList<>();
        for (int d = 1; d <= ym.lengthOfMonth(); d++) {
            LocalDate date = LocalDate.of(year, month, d);
            int dow = date.getDayOfWeek().getValue(); // 1=Mon .. 7=Sun
            if (dow < 6) tradingDays.add(date);
        }

        int total = tradingDays.size();
        int totalFound = 0;
        logger.info("[earnings] 拉取 " + monthKey + "，共 " + total + " 个交易日...");
        emit.accept(Map.of("status", "start", "total", total, "processed", 0));

        int processed = 0;
        for (LocalDate date : tradingDays) {
            List<EarningsCalendarEntry> entries = fetchEntriesForDate(date, sp500);

            // 覆盖式更新该日数据
            entryRepo.deleteByEntryDate(date);
            if (!entries.isEmpty()) {
                entryRepo.saveAll(entries);
                totalFound += entries.size();
            }

            processed++;
            try {
                Thread.sleep(500);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            Map<String, Object> progress = new HashMap<>();
            progress.put("status", "progress");
            progress.put("processed", processed);
            progress.put("total", total);
            progress.put("date", date.format(ISO));
            progress.put("found", entries.size());
            emit.accept(progress);
        }

        EarningsMonthFetch mf = new EarningsMonthFetch();
        mf.setMonthKey(monthKey);
        mf.setFetchedAt(LocalDateTime.now());
        monthRepo.save(mf);

        logger.info("[earnings] " + monthKey + " 完成，共 " + totalFound + " 家大盘股财报");

        Map<String, Object> done = new HashMap<>();
        done.put("status", "done");
        done.put("totalFound", totalFound);
        done.put("result", buildResponse(entryRepo.findAll()));
        emit.accept(done);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Nasdaq 抓取
    // ══════════════════════════════════════════════════════════════════════

    private List<EarningsCalendarEntry> fetchEntriesForDate(LocalDate date, Set<String> sp500) {
        JsonNode rows = fetchRows(date.format(ISO));
        List<EarningsCalendarEntry> result = new ArrayList<>();
        if (rows == null || !rows.isArray()) return result;

        for (JsonNode row : rows) {
            long cap = parseMarketCap(text(row, "marketCap"));
            int numEsts = parseInt(text(row, "noOfEsts"));
            if (cap < MIN_MARKET_CAP || numEsts < MIN_ESTIMATES) continue;

            String ticker = text(row, "symbol").toUpperCase(Locale.ROOT);
            String epsActual = text(row, "epsActual");
            String timeRaw = text(row, "time");

            EarningsCalendarEntry e = new EarningsCalendarEntry();
            e.setTicker(ticker);
            e.setName(text(row, "name"));
            e.setEntryDate(date);
            e.setReportTime(mapTiming(timeRaw));
            e.setMarketCap(formatMarketCap(cap));
            e.setMarketCapRaw(cap);
            e.setSp500(sp500.contains(ticker));
            e.setSector(getSector(ticker));
            e.setEpsForecast(text(row, "epsForecast"));
            e.setEpsActual(epsActual);
            e.setSurprise(text(row, "surprise"));
            e.setNumEstimates(numEsts);
            e.setConfirmed(!"time-not-supplied".equals(timeRaw));
            e.setReported(!epsActual.isBlank());
            result.add(e);
        }
        result.sort(Comparator.comparingLong(EarningsCalendarEntry::getMarketCapRaw).reversed());
        return result;
    }

    private JsonNode fetchRows(String dateStr) {
        String url = "https://api.nasdaq.com/api/calendar/earnings?date=" + dateStr;
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(15))
                        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
                        .header("Accept", "application/json, text/plain, */*")
                        .header("Accept-Language", "en-US,en;q=0.9")
                        .GET()
                        .build();
                HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
                if (resp.statusCode() == 200) {
                    JsonNode root = mapper.readTree(resp.body());
                    JsonNode data = root.get("data");
                    return (data != null) ? data.get("rows") : null;
                } else if (resp.statusCode() == 429) {
                    Thread.sleep(3000L * (attempt + 1));
                } else {
                    logger.warning("[earnings] " + dateStr + " 状态码 " + resp.statusCode());
                    return null;
                }
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return null;
            } catch (Exception ex) {
                logger.warning("[earnings] " + dateStr + " 请求失败: " + ex.getMessage());
                try {
                    Thread.sleep(2000L * (attempt + 1));
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return null;
                }
            }
        }
        return null;
    }

    // ── 板块 ─────────────────────────────────────────────────────────────────

    private String getSector(String ticker) {
        ticker = ticker.toUpperCase(Locale.ROOT);
        if (sectorCache.containsKey(ticker)) return sectorCache.get(ticker);
        String s = SECTOR_STATIC.getOrDefault(ticker, "—");
        sectorCache.put(ticker, s);
        return s;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  响应构建
    // ══════════════════════════════════════════════════════════════════════

    private Map<String, Object> buildResponse(List<EarningsCalendarEntry> all) {
        // calendar: 按日期分组（保持日期升序）
        Map<String, List<EarningsCalendarEntry>> calendar = new TreeMap<>();
        for (EarningsCalendarEntry e : all) {
            calendar.computeIfAbsent(e.getEntryDate().format(ISO), k -> new ArrayList<>()).add(e);
        }
        for (List<EarningsCalendarEntry> list : calendar.values()) {
            list.sort(Comparator.comparingLong(
                    (EarningsCalendarEntry e) -> e.getMarketCapRaw() == null ? 0L : e.getMarketCapRaw()).reversed());
        }

        // monthsFetched
        Map<String, String> monthsFetched = new TreeMap<>();
        for (EarningsMonthFetch mf : monthRepo.findAll()) {
            monthsFetched.put(mf.getMonthKey(), mf.getFetchedAt().toString());
        }

        // watchlist: 今天起 7 天内
        LocalDate today = LocalDate.now();
        LocalDate cutoff = today.plusDays(7);
        List<EarningsCalendarEntry> watchlist = new ArrayList<>();
        for (EarningsCalendarEntry e : all) {
            LocalDate d = e.getEntryDate();
            if (!d.isBefore(today) && !d.isAfter(cutoff)) watchlist.add(e);
        }
        watchlist.sort(Comparator
                .comparing(EarningsCalendarEntry::getEntryDate)
                .thenComparing(e -> -(e.getMarketCapRaw() == null ? 0L : e.getMarketCapRaw())));

        Map<String, Object> resp = new HashMap<>();
        resp.put("calendar", calendar);
        resp.put("monthsFetched", monthsFetched);
        resp.put("watchlist", watchlist);
        return resp;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  工具方法
    // ══════════════════════════════════════════════════════════════════════

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return (v == null || v.isNull()) ? "" : v.asText("").trim();
    }

    private static int parseInt(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** 解析 Nasdaq 格式市值 "$210,340,320,000" → long */
    private static long parseMarketCap(String capStr) {
        if (capStr == null || capStr.isBlank()) return 0;
        String cleaned = capStr.replace("$", "").replace(",", "").trim();
        try {
            return Long.parseLong(cleaned);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** 格式化市值 → "~210B" 或 "~3.5T" */
    private static String formatMarketCap(long value) {
        if (value >= 1_000_000_000_000L) {
            return String.format("~%.1fT", value / 1_000_000_000_000.0);
        } else if (value >= 1_000_000_000L) {
            return String.format("~%.0fB", value / 1_000_000_000.0);
        } else {
            return String.format("~%.0fM", value / 1_000_000.0);
        }
    }

    /** 映射 Nasdaq time 字段为中文 */
    private static String mapTiming(String timeStr) {
        switch (timeStr) {
            case "time-pre-market": return "盘前";
            case "time-after-hours": return "盘后";
            default: return "未公布";
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  静态数据：板块映射 + S&P 500 回退列表
    // ══════════════════════════════════════════════════════════════════════

    private static final Map<String, String> SECTOR_STATIC = buildSectorStatic();

    private static Map<String, String> buildSectorStatic() {
        Map<String, String> m = new HashMap<>();
        String[][] groups = {
            {"Technology", "AAPL", "MSFT", "GOOGL", "GOOG", "META", "NVDA", "AVGO", "AMD", "INTC",
                "CRM", "ADBE", "ORCL", "CSCO", "QCOM", "TXN", "AMAT", "LRCX", "MU", "INTU", "NOW",
                "SNPS", "CDNS", "KLAC", "ADI", "MCHP", "FTNT", "PANW", "CRWD", "NET", "PLTR", "WDAY",
                "SNOW", "DDOG", "ZS", "DELL", "HPE", "HPQ", "SMCI", "ARM", "MRVL", "ON", "MPWR",
                "CRDO", "UBER"},
            {"Financial", "JPM", "BAC", "GS", "MS", "WFC", "C", "BLK", "SCHW", "AXP", "V", "MA",
                "COF", "COIN"},
            {"Healthcare", "JNJ", "UNH", "LLY", "PFE", "MRK", "ABBV", "TMO", "ABT", "DHR", "AMGN",
                "GILD", "VRTX", "ISRG", "SYK", "REGN", "BMY", "MDT", "ELV", "CI", "HCA", "DXCM"},
            {"Energy", "XOM", "CVX", "COP", "SLB", "EOG", "OXY", "PSX", "VLO", "DVN", "BKR", "HAL",
                "FANG"},
            {"Consumer Staples", "PG", "KO", "PEP", "COST", "WMT", "PM", "MO", "CL", "MDLZ", "KDP",
                "STZ", "KHC"},
            {"Consumer Discretionary", "AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "TJX", "BKNG",
                "SBUX", "CMG", "LULU", "ROST", "DG", "DLTR", "ULTA", "YUM", "ABNB"},
            {"Industrials", "BA", "CAT", "GE", "HON", "UPS", "RTX", "DE", "UNP", "FDX", "LIN",
                "EMR", "GD", "NOC", "ITW", "WM"},
            {"Utilities", "NEE", "DUK", "SO", "D", "AEP", "SRE", "EXC", "XEL", "PCG"},
            {"Communication Services", "T", "TMUS", "VZ", "CMCSA", "DIS", "NFLX"},
        };
        for (String[] g : groups) {
            String sector = g[0];
            for (int i = 1; i < g.length; i++) m.put(g[i], sector);
        }
        return m;
    }

    private static final Set<String> SP500_FALLBACK = new HashSet<>(Arrays.asList(
        "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "GOOG", "META", "BRK-B", "TSLA",
        "UNH", "XOM", "JNJ", "JPM", "V", "PG", "MA", "AVGO", "HD", "LLY", "MRK",
        "CVX", "ABBV", "COST", "PEP", "KO", "ADBE", "WMT", "MCD", "CSCO", "CRM",
        "BAC", "PFE", "TMO", "ACN", "NFLX", "AMD", "ABT", "DHR", "LIN", "ORCL",
        "CMCSA", "TXN", "DIS", "NKE", "PM", "NEE", "WFC", "UPS", "RTX", "HON",
        "QCOM", "UNP", "LOW", "INTU", "SPGI", "IBM", "BA", "BMY", "GE", "CAT",
        "AMGN", "ELV", "AMAT", "GS", "DE", "ISRG", "MDT", "MS", "BLK", "ADP",
        "GILD", "VRTX", "SYK", "ADI", "REGN", "MMC", "SCHW", "CI", "T", "CB",
        "LRCX", "ZTS", "MO", "BKNG", "MDLZ", "PGR", "AXP", "TMUS", "SO", "DUK",
        "CL", "EOG", "CME", "TGT", "SLB", "SNPS", "ITW", "CDNS", "NOC", "BDX",
        "MMM", "COP", "FDX", "USB", "WM", "TJX", "MU", "PNC", "CSX", "KLAC",
        "APD", "ORLY", "ICE", "SHW", "NSC", "MCO", "EMR", "AIG", "GD", "F",
        "GM", "PSA", "MAR", "HUM", "MCHP", "FTNT", "ROP", "MET", "KMB", "D",
        "AEP", "CTAS", "SRE", "OXY", "PANW", "DXCM", "CCI", "A", "AZO", "KDP",
        "TRV", "AFL", "ALL", "SPG", "O", "MSCI", "HLT", "PCAR", "NUE", "CARR",
        "TEL", "MNST", "GIS", "WELL", "PSX", "WMB", "VLO", "PCG", "CTVA", "CMG",
        "HCA", "DVN", "EW", "BIIB", "ROST", "DG", "DLTR", "YUM", "KHC", "FAST",
        "STZ", "PPG", "HSY", "IDXX", "ED", "PAYX", "AWK", "IQV", "MTD", "ON",
        "CPRT", "VRSK", "ODFL", "BKR", "GEHC", "FANG", "MPWR", "CSGP", "CDW",
        "EXC", "XEL", "ACGL", "HPQ", "DOW", "CTSH", "ULTA", "GWW", "HAL", "LULU",
        "HPE", "CRWD", "DECK", "SMCI", "WDAY", "ABNB", "COIN", "PLTR", "UBER"
    ));
}
