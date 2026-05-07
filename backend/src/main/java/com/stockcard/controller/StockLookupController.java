package com.stockcard.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

@RestController
@RequestMapping("/api/lookup")
public class StockLookupController {

    private static final Logger logger = Logger.getLogger(StockLookupController.class.getName());
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Fetches a URL with SSL verification disabled (for APIs with cert issues on the JVM trust store). */
    private Map<?, ?> fetchJsonSkipSsl(String url) throws Exception {
        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(null, new TrustManager[]{
            new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                public void checkClientTrusted(X509Certificate[] c, String a) {}
                public void checkServerTrusted(X509Certificate[] c, String a) {}
            }
        }, new SecureRandom());
        HttpClient client = HttpClient.newBuilder().sslContext(sslContext).build();
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        return objectMapper.readValue(response.body(), Map.class);
    }

    private static final String EASTMONEY_TOKEN = "D43BF722C8E33BDC906FB84D85E326E8";
    private static final String SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
    private static final long SEC_CACHE_TTL_MS = TimeUnit.HOURS.toMillis(12);
    private volatile List<Map<String, String>> secTickerCache = List.of();
    private volatile long secTickerCacheAtMs = 0L;

    private final ConfigController configController;

    public StockLookupController(ConfigController configController) {
        this.configController = configController;
    }

    // ─────────────── A股 (EastMoney) ───────────────

    @GetMapping
    public ResponseEntity<Map<String, String>> lookup(@RequestParam String keyword) {
        try {
            String encodedKeyword = URLEncoder.encode(keyword, StandardCharsets.UTF_8);
            String url = "https://searchapi.eastmoney.com/api/suggest/get?input=" + encodedKeyword + "&type=14&token=" + EASTMONEY_TOKEN + "&count=1";
            Map<?, ?> response = restTemplate.getForObject(url, Map.class);

            List<Map<String, String>> suggestions = extractEastMoneySuggestions(response);
            if (!suggestions.isEmpty()) {
                return ResponseEntity.ok(suggestions.get(0));
            }
            return ResponseEntity.ok(Map.of("code", "", "name", "", "error", "未找到"));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("code", "", "name", "", "error", "查询失败: " + e.getMessage()));
        }
    }

    @GetMapping("/suggest")
    public ResponseEntity<List<Map<String, String>>> suggest(
            @RequestParam String keyword,
            @RequestParam(defaultValue = "8") int limit) {
        try {
            if (keyword == null || keyword.trim().isEmpty()) {
                return ResponseEntity.ok(List.of());
            }
            int safeLimit = Math.min(Math.max(limit, 1), 20);
            String encodedKeyword = URLEncoder.encode(keyword.trim(), StandardCharsets.UTF_8);
            String url = "https://searchapi.eastmoney.com/api/suggest/get?input=" + encodedKeyword + "&type=14&token=" + EASTMONEY_TOKEN + "&count=" + safeLimit;
            Map<?, ?> response = restTemplate.getForObject(url, Map.class);
            return ResponseEntity.ok(extractEastMoneySuggestions(response));
        } catch (Exception e) {
            return ResponseEntity.ok(List.of());
        }
    }

    // ─────────────── 美股 (SEC primary) ───────────────

    @GetMapping("/us")
    public ResponseEntity<Map<String, String>> lookupUs(@RequestParam String keyword) {
        try {
            String kw = keyword == null ? "" : keyword.trim();
            if (kw.isEmpty()) {
                return ResponseEntity.ok(Map.of("code", "", "name", "", "error", "未找到"));
            }

            // SEC official ticker map (primary in this network environment)
            Map<String, String> secExact = fetchSecExact(kw);
            if (secExact != null) {
                return ResponseEntity.ok(secExact);
            }

            // SEC prefix/contains suggestions
            List<Map<String, String>> secSuggestions = fetchSecSuggestions(kw, 1);
            if (!secSuggestions.isEmpty()) {
                return ResponseEntity.ok(secSuggestions.get(0));
            }

            return ResponseEntity.ok(Map.of("code", "", "name", "", "error", "未找到"));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("code", "", "name", "", "error", "查询失败: " + e.getMessage()));
        }
    }

    @GetMapping("/us/suggest")
    public ResponseEntity<List<Map<String, String>>> suggestUs(
            @RequestParam String keyword,
            @RequestParam(defaultValue = "8") int limit) {
        try {
            if (keyword == null || keyword.trim().isEmpty()) {
                return ResponseEntity.ok(List.of());
            }
            int safeLimit = Math.min(Math.max(limit, 1), 20);

            // SEC-only suggestions for better stability and lower latency
            return ResponseEntity.ok(fetchSecSuggestions(keyword.trim(), safeLimit));
        } catch (Exception e) {
            return ResponseEntity.ok(List.of());
        }
    }

    // ─────────────── Helpers ───────────────

    /** Direct ticker lookup via Yahoo Finance /v8/finance/chart — confirmed working, no crumb needed. */
    private Map<String, String> fetchYahooQuote(String ticker) {
        try {
            String url = "https://query2.finance.yahoo.com/v8/finance/chart/"
                    + ticker  // ticker should already be uppercase from caller
                    + "?range=1d&interval=1d&includePrePost=false";
            logger.info("Fetching Yahoo quote: " + url);
            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, new HttpEntity<>(buildYahooHeaders()), Map.class);
            Map<?, ?> body = response.getBody();
            if (body == null) {
                logger.warning("Yahoo response body is null");
                return null;
            }
            Object chartObj = body.get("chart");
            if (!(chartObj instanceof Map<?, ?> chart)) {
                logger.warning("No 'chart' in response. Keys: " + body.keySet());
                return null;
            }
            Object resultObj = chart.get("result");
            if (!(resultObj instanceof List<?> results) || results.isEmpty()) {
                logger.warning("No 'result' or empty result list in chart");
                return null;
            }
            Object first = results.get(0);
            if (!(first instanceof Map<?, ?> itemMap)) {
                logger.warning("First result is not a Map");
                return null;
            }
            Object metaObj = itemMap.get("meta");
            if (!(metaObj instanceof Map<?, ?> meta)) {
                logger.warning("No 'meta' in result. Keys: " + itemMap.keySet());
                return null;
            }
            Object symbolObj = meta.get("symbol");
            Object longName = meta.get("longName");
            Object shortName = meta.get("shortName");
            Object nameObj = longName != null ? longName : shortName;
            if (symbolObj == null || nameObj == null) {
                logger.warning("Missing symbol or name in meta. symbol=" + symbolObj + ", longName=" + longName + ", shortName=" + shortName);
                return null;
            }
            String symbol = String.valueOf(symbolObj).trim();
            String name = String.valueOf(nameObj).trim();
            if (symbol.isEmpty() || name.isEmpty()) {
                logger.warning("Symbol or name is empty. symbol=" + symbol + ", name=" + name);
                return null;
            }
            logger.info("Successfully found: " + symbol + " = " + name);
            return Map.of("code", symbol, "name", name);
        } catch (Exception e) {
            logger.warning("Yahoo quote unavailable for '" + ticker + "': " + e.getMessage());
            return null;
        }
    }

    private List<Map<String, String>> fetchYahooSuggestions(String keyword, int limit) {
        try {
            String encodedKeyword = URLEncoder.encode(keyword, StandardCharsets.UTF_8);
            // query2 + corsDomain is more permissive than query1
            String url = "https://query2.finance.yahoo.com/v1/finance/search?q=" + encodedKeyword
                    + "&quotesCount=" + limit + "&newsCount=0&enableFuzzyQuery=false"
                    + "&lang=en-US&region=US&corsDomain=finance.yahoo.com";

            logger.info("Fetching Yahoo suggestions: " + url);
            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, new HttpEntity<>(buildYahooHeaders()), Map.class);
            Map<?, ?> body = response.getBody();
            if (body == null || !body.containsKey("quotes")) {
                logger.warning("No quotes in response");
                return List.of();
            }

            List<?> quotes = (List<?>) body.get("quotes");
            List<Map<String, String>> result = new ArrayList<>();
            for (Object item : quotes) {
                if (!(item instanceof Map itemMap)) continue;
                String quoteType = String.valueOf(itemMap.getOrDefault("quoteType", ""));
                if (!"EQUITY".equals(quoteType) && !"ETF".equals(quoteType)) continue;
                Object symbolObj = itemMap.get("symbol");
                Object longName = itemMap.get("longname");
                Object shortName = itemMap.get("shortname");
                Object nameObj = (longName != null) ? longName : shortName;
                if (symbolObj == null || nameObj == null) continue;
                String symbol = String.valueOf(symbolObj).trim();
                String name = String.valueOf(nameObj).trim();
                if (!symbol.isEmpty() && !name.isEmpty()) {
                    result.add(Map.of("code", symbol, "name", name));
                }
            }
            logger.info("Found " + result.size() + " suggestions for: " + keyword);
            return result;
        } catch (Exception e) {
            logger.warning("Yahoo suggestions unavailable for '" + keyword + "': " + e.getMessage());
            return List.of();
        }
    }

    private Map<String, String> fetchSecExact(String keyword) {
        List<Map<String, String>> secData = getSecTickers();
        if (secData.isEmpty()) return null;

        String upper = keyword.toUpperCase(Locale.ROOT);
        for (Map<String, String> item : secData) {
            if (upper.equals(item.get("code"))) {
                return item;
            }
        }
        return null;
    }

    private List<Map<String, String>> fetchSecSuggestions(String keyword, int limit) {
        List<Map<String, String>> secData = getSecTickers();
        if (secData.isEmpty()) return List.of();

        String upper = keyword.toUpperCase(Locale.ROOT);
        String lower = keyword.toLowerCase(Locale.ROOT);
        List<Map<String, String>> result = new ArrayList<>();

        // Prefer ticker prefix matches first
        for (Map<String, String> item : secData) {
            if (result.size() >= limit) break;
            String code = item.get("code");
            if (code != null && code.startsWith(upper)) {
                addUniqueByCode(result, item);
            }
        }

        // Then ticker contains / name contains matches
        for (Map<String, String> item : secData) {
            if (result.size() >= limit) break;
            String code = item.get("code");
            String name = item.get("name");
            boolean codeHit = code != null && code.contains(upper);
            boolean nameHit = name != null && name.toLowerCase(Locale.ROOT).contains(lower);
            if (codeHit || nameHit) {
                addUniqueByCode(result, item);
            }
        }

        return result;
    }

    private List<Map<String, String>> getSecTickers() {
        long now = System.currentTimeMillis();
        if (!secTickerCache.isEmpty() && (now - secTickerCacheAtMs) < SEC_CACHE_TTL_MS) {
            return secTickerCache;
        }

        synchronized (this) {
            now = System.currentTimeMillis();
            if (!secTickerCache.isEmpty() && (now - secTickerCacheAtMs) < SEC_CACHE_TTL_MS) {
                return secTickerCache;
            }

            try {
                ResponseEntity<Map> response = restTemplate.exchange(
                        SEC_TICKERS_URL,
                        HttpMethod.GET,
                        new HttpEntity<>(buildSecHeaders()),
                        Map.class
                );

                Map<?, ?> body = response.getBody();
                if (body == null || body.isEmpty()) {
                    logger.warning("SEC tickers response is empty");
                    return secTickerCache;
                }

                List<Map<String, String>> parsed = new ArrayList<>();
                for (Object value : body.values()) {
                    if (!(value instanceof Map<?, ?> row)) continue;
                    Object tickerObj = row.get("ticker");
                    Object titleObj = row.get("title");
                    if (tickerObj == null || titleObj == null) continue;

                    String code = String.valueOf(tickerObj).trim().toUpperCase(Locale.ROOT);
                    String name = String.valueOf(titleObj).trim();
                    if (!code.isEmpty() && !name.isEmpty()) {
                        parsed.add(Map.of("code", code, "name", name));
                    }
                }

                parsed.sort(Comparator.comparing(m -> m.get("code")));
                secTickerCache = parsed;
                secTickerCacheAtMs = System.currentTimeMillis();
                logger.info("Loaded SEC ticker cache: " + parsed.size() + " entries");
            } catch (Exception e) {
                logger.warning("SEC ticker fallback unavailable: " + e.getMessage());
            }
        }

        return secTickerCache;
    }

    private HttpHeaders buildSecHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("User-Agent", "StockInfoApp/1.0 (stock-info@example.com)");
        headers.set("Accept", "application/json");
        return headers;
    }

    private List<Map<String, String>> mergeUniqueByCode(List<Map<String, String>> primary, List<Map<String, String>> secondary, int limit) {
        List<Map<String, String>> merged = new ArrayList<>();
        for (Map<String, String> item : primary) {
            if (merged.size() >= limit) break;
            addUniqueByCode(merged, item);
        }
        for (Map<String, String> item : secondary) {
            if (merged.size() >= limit) break;
            addUniqueByCode(merged, item);
        }
        return merged;
    }

    private void addUniqueByCode(List<Map<String, String>> list, Map<String, String> candidate) {
        String code = candidate.get("code");
        if (code == null || code.isEmpty()) return;
        for (Map<String, String> item : list) {
            if (code.equals(item.get("code"))) {
                return;
            }
        }
        list.add(candidate);
    }

    private HttpHeaders buildYahooHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
        headers.set("Accept", "application/json");
        headers.set("Accept-Language", "en-US,en;q=0.9");
        headers.set("Referer", "https://finance.yahoo.com/");
        return headers;
    }

    private List<Map<String, String>> extractEastMoneySuggestions(Map<?, ?> response) {
        List<Map<String, String>> result = new ArrayList<>();
        if (response == null || !response.containsKey("QuotationCodeTable")) {
            return result;
        }
        Object tableObject = response.get("QuotationCodeTable");
        if (!(tableObject instanceof Map<?, ?> table)) {
            return result;
        }
        if (!table.containsKey("Data")) return result;
        List<?> dataList = (List<?>) table.get("Data");
        if (dataList == null) return result;
        for (Object item : dataList) {
            if (!(item instanceof Map itemMap)) continue;
            Object codeObj = itemMap.get("Code");
            Object nameObj = itemMap.get("Name");
            if (codeObj == null || nameObj == null) continue;
            String code = String.valueOf(codeObj).trim();
            String name = String.valueOf(nameObj).trim();
            if (!code.isEmpty() && !name.isEmpty()) {
                result.add(Map.of("code", code, "name", name));
            }
        }
        return result;
    }

    // ─────────────── 全球市场 (Twelve Data) ───────────────

    /**
     * Exchange codes for each market (Twelve Data):
     *   JP → JPX (Tokyo), KR → KRX (Korea), TW → TWSE (Taiwan), HK → HKEX
     */
    private static final Map<String, String> MARKET_TO_EXCHANGE = Map.of(
        "JP", "JPX",
        "KR", "KRX",
        "TW", "TWSE",
        "HK", "HKEX"
    );

    @GetMapping("/global/suggest")
    public ResponseEntity<List<Map<String, String>>> suggestGlobal(
            @RequestParam String keyword,
            @RequestParam String market,
            @RequestParam(defaultValue = "8") int limit) {
        try {
            if (keyword == null || keyword.trim().isEmpty()) {
                return ResponseEntity.ok(List.of());
            }
            int safeLimit = Math.min(Math.max(limit, 1), 20);
            String kw = keyword.trim();
            String marketUpper = market == null ? "" : market.toUpperCase(Locale.ROOT);

            // Try Twelve Data first if API key is configured
            String twelveDataApiKey = configController.resolveApiKey();
            if (twelveDataApiKey != null && !twelveDataApiKey.isBlank()) {
                String exchange = MARKET_TO_EXCHANGE.get(marketUpper);
                if (exchange != null) {
                    try {
                        String encoded = URLEncoder.encode(kw, StandardCharsets.UTF_8);
                        String url = "https://api.twelvedata.com/symbol_search?symbol=" + encoded
                                + "&exchange=" + exchange
                                + "&outputsize=" + safeLimit
                                + "&apikey=" + twelveDataApiKey;
                        Map<?, ?> response = fetchJsonSkipSsl(url);
                        List<Map<String, String>> tdResults = parseTwelveDataResult(response, safeLimit);
                        if (!tdResults.isEmpty()) {
                            return ResponseEntity.ok(tdResults);
                        }
                    } catch (Exception e) {
                        logger.warning("Twelve Data global suggest failed: " + e.getMessage());
                    }
                }
            }

            return ResponseEntity.ok(List.of());
        } catch (Exception e) {
            logger.warning("Global suggest failed: " + e.getMessage());
            return ResponseEntity.ok(List.of());
        }
    }

    @GetMapping("/global")
    public ResponseEntity<Map<String, String>> lookupGlobal(
            @RequestParam String keyword,
            @RequestParam String market) {
        try {
            List<Map<String, String>> results = suggestGlobal(keyword, market, 1).getBody();
            if (results != null && !results.isEmpty()) {
                return ResponseEntity.ok(results.get(0));
            }
            return ResponseEntity.ok(Map.of("code", "", "name", "", "error", "未找到"));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("code", "", "name", "", "error", "查询失败: " + e.getMessage()));
        }
    }

    private List<Map<String, String>> parseTwelveDataResult(Map<?, ?> response, int limit) {
        List<Map<String, String>> result = new ArrayList<>();
        if (response == null) return result;
        Object dataObj = response.get("data");
        if (!(dataObj instanceof List<?> dataList)) return result;
        for (Object item : dataList) {
            if (result.size() >= limit) break;
            if (!(item instanceof Map<?, ?> row)) continue;
            Object symbolObj = row.get("symbol");
            Object nameObj = row.get("instrument_name");
            Object exchangeObj = row.get("exchange");
            if (symbolObj == null || nameObj == null) continue;
            String code = String.valueOf(symbolObj).trim();
            String name = String.valueOf(nameObj).trim();
            String exchange = exchangeObj != null ? String.valueOf(exchangeObj).trim() : "";
            if (!code.isEmpty() && !name.isEmpty()) {
                result.add(Map.of("code", code, "name", name, "exchange", exchange));
            }
        }
        return result;
    }
}
