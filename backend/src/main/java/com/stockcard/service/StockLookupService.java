package com.stockcard.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** External stock-code lookup across EastMoney (A股), SEC/Yahoo (US), and Twelve Data (global). */
@Service
public class StockLookupService {

    private static final Logger logger = LoggerFactory.getLogger(StockLookupService.class);
    private static final Map<String, String> LOOKUP_FAILED = Map.of("code", "", "name", "", "error", "查询失败，请稍后重试");
    private final RestTemplate restTemplate;

    @Value("${app.eastmoney.token:}")
    private String eastMoneyToken;
    private static final String SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
    private static final long SEC_CACHE_TTL_MS = TimeUnit.HOURS.toMillis(12);
    private volatile List<Map<String, String>> secTickerCache = List.of();
    private volatile long secTickerCacheAtMs = 0L;

    private static final Map<String, String> MARKET_TO_EXCHANGE = Map.of(
        "JP", "JPX",
        "KR", "KRX",
        "TW", "TWSE",
        "HK", "HKEX"
    );

    private final AppConfigService appConfigService;

    public StockLookupService(AppConfigService appConfigService, RestTemplate externalRestTemplate) {
        this.appConfigService = appConfigService;
        this.restTemplate = externalRestTemplate;
    }

    // ─────────────── A股 (EastMoney) ───────────────

    /** URI (not String) so RestTemplate doesn't treat it as a template and re-encode the already-encoded query. */
    private Map<?, ?> fetchEastMoney(String keyword, int count) {
        String encodedKeyword = URLEncoder.encode(keyword, StandardCharsets.UTF_8);
        String url = "https://searchapi.eastmoney.com/api/suggest/get?input=" + encodedKeyword
                + "&type=14&token=" + URLEncoder.encode(eastMoneyToken, StandardCharsets.UTF_8) + "&count=" + count;
        return restTemplate.getForObject(URI.create(url), Map.class);
    }

    public Map<String, String> lookup(String keyword) {
        try {
            Map<?, ?> response = fetchEastMoney(keyword, 1);

            List<Map<String, String>> suggestions = extractEastMoneySuggestions(response);
            if (!suggestions.isEmpty()) {
                return suggestions.get(0);
            }
            return Map.of("code", "", "name", "", "error", "未找到");
        } catch (Exception e) {
            logger.warn("EastMoney lookup failed: {}", e.toString());
            return LOOKUP_FAILED;
        }
    }

    public List<Map<String, String>> suggest(String keyword, int limit) {
        try {
            if (keyword == null || keyword.trim().isEmpty()) {
                return List.of();
            }
            int safeLimit = Math.min(Math.max(limit, 1), 20);
            Map<?, ?> response = fetchEastMoney(keyword.trim(), safeLimit);
            return extractEastMoneySuggestions(response);
        } catch (Exception e) {
            logger.warn("EastMoney suggest failed: {}", e.toString());
            return List.of();
        }
    }

    // ─────────────── 美股 (SEC primary) ───────────────

    public Map<String, String> lookupUs(String keyword) {
        try {
            String kw = keyword == null ? "" : keyword.trim();
            if (kw.isEmpty()) {
                return Map.of("code", "", "name", "", "error", "未找到");
            }

            // SEC official ticker map (primary in this network environment)
            Map<String, String> secExact = fetchSecExact(kw);
            if (secExact != null) {
                return secExact;
            }

            // SEC prefix/contains suggestions
            List<Map<String, String>> secSuggestions = fetchSecSuggestions(kw, 1);
            if (!secSuggestions.isEmpty()) {
                return secSuggestions.get(0);
            }

            return Map.of("code", "", "name", "", "error", "未找到");
        } catch (Exception e) {
            logger.warn("SEC lookup failed: {}", e.toString());
            return LOOKUP_FAILED;
        }
    }

    public List<Map<String, String>> suggestUs(String keyword, int limit) {
        try {
            if (keyword == null || keyword.trim().isEmpty()) {
                return List.of();
            }
            int safeLimit = Math.min(Math.max(limit, 1), 20);
            // SEC-only suggestions for better stability and lower latency
            return fetchSecSuggestions(keyword.trim(), safeLimit);
        } catch (Exception e) {
            return List.of();
        }
    }

    // ─────────────── Helpers ───────────────

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
                    logger.warn("SEC tickers response is empty");
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
                logger.info("Loaded SEC ticker cache: {} entries", parsed.size());
            } catch (Exception e) {
                logger.warn("SEC ticker fallback unavailable: {}", e.toString());
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

    public List<Map<String, String>> suggestGlobal(String keyword, String market, int limit) {
        try {
            if (keyword == null || keyword.trim().isEmpty()) {
                return List.of();
            }
            int safeLimit = Math.min(Math.max(limit, 1), 20);
            String kw = keyword.trim();
            String marketUpper = market == null ? "" : market.toUpperCase(Locale.ROOT);

            // Try Twelve Data first if API key is configured
            String twelveDataApiKey = appConfigService.resolveTwelveDataApiKey();
            if (twelveDataApiKey != null && !twelveDataApiKey.isBlank()) {
                String exchange = MARKET_TO_EXCHANGE.get(marketUpper);
                if (exchange != null) {
                    try {
                        String encoded = URLEncoder.encode(kw, StandardCharsets.UTF_8);
                        String url = "https://api.twelvedata.com/symbol_search?symbol=" + encoded
                                + "&exchange=" + exchange
                                + "&outputsize=" + safeLimit;
                        // Key goes in a header (not the URL) so it can never show up in exception messages / logs.
                        HttpHeaders headers = new HttpHeaders();
                        headers.set(HttpHeaders.AUTHORIZATION, "apikey " + twelveDataApiKey);
                        // URI (not String) so RestTemplate doesn't re-encode the already-encoded query.
                        Map<?, ?> response = restTemplate.exchange(
                                URI.create(url), HttpMethod.GET, new HttpEntity<>(headers), Map.class).getBody();
                        List<Map<String, String>> tdResults = parseTwelveDataResult(response, safeLimit);
                        if (!tdResults.isEmpty()) {
                            return tdResults;
                        }
                    } catch (Exception e) {
                        logger.warn("Twelve Data global suggest failed: {}", e.toString());
                    }
                }
            }

            return List.of();
        } catch (Exception e) {
            logger.warn("Global suggest failed: {}", e.toString());
            return List.of();
        }
    }

    public Map<String, String> lookupGlobal(String keyword, String market) {
        try {
            List<Map<String, String>> results = suggestGlobal(keyword, market, 1);
            if (results != null && !results.isEmpty()) {
                return results.get(0);
            }
            return Map.of("code", "", "name", "", "error", "未找到");
        } catch (Exception e) {
            logger.warn("Global lookup failed: {}", e.toString());
            return LOOKUP_FAILED;
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
