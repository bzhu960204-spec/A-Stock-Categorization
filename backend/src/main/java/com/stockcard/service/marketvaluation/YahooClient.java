package com.stockcard.service.marketvaluation;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Yahoo Finance chart API: daily index / ETF prices (design §3.1.2, §4.2). Unofficial endpoint, so a failure only affects this source. */
@Component
public class YahooClient implements MvSourceClient {

    private static final String BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";

    /** The ETFs use the dividend-adjusted close so RSP / SPY is not distorted by payouts; indices use the plain close. */
    private record Spec(String code, String symbol, boolean adjusted) {}

    private static final List<Spec> SPECS = List.of(
            new Spec("PX_SPX", "^GSPC", false),
            new Spec("PX_NDX", "^NDX", false),
            new Spec("PX_DJI", "^DJI", false),
            new Spec("PX_RUT", "^RUT", false),
            new Spec("PX_W5000", "^W5000", false),
            new Spec("VIX", "^VIX", false),
            new Spec("PX_SPY", "SPY", true),
            new Spec("PX_RSP", "RSP", true));

    private final MvHttp http;

    public YahooClient(MvHttp http) {
        this.http = http;
    }

    @Override
    public MvSource source() {
        return MvSource.YAHOO;
    }

    @Override
    public Map<String, List<MvPoint>> fetch(LocalDate from, LocalDate to, FetchMode mode) {
        return fetchDetailed(from, to, mode, SyncProgress.NONE).points();
    }

    @Override
    public MvFetchResult fetchDetailed(LocalDate from, LocalDate to, FetchMode mode, SyncProgress progress) {
        Map<String, List<MvPoint>> out = new LinkedHashMap<>();
        List<String> warnings = new ArrayList<>();
        for (int i = 0; i < SPECS.size(); i++) {
            Spec spec = SPECS.get(i);
            progress.onStep(i + 1, SPECS.size(), spec.symbol());
            try {
                out.put(spec.code(), parse(http.getJson(uri(spec.symbol(), from, to)), spec.adjusted()));
            } catch (RuntimeException e) {
                warnings.add(spec.symbol() + ": " + MvHttp.redact(e.getMessage()));
            }
        }
        if (out.isEmpty()) throw new IllegalStateException("Yahoo 全部请求失败：" + String.join("；", warnings));
        return new MvFetchResult(out, warnings);
    }

    /** {@code range=max} would return monthly bars, so the window is always given as period1 / period2 (daily bars). */
    static URI uri(String symbol, LocalDate from, LocalDate to) {
        long period1 = from.atStartOfDay(ZoneOffset.UTC).toEpochSecond();
        long period2 = to.plusDays(2).atStartOfDay(ZoneOffset.UTC).toEpochSecond();
        return URI.create(BASE + symbol.replace("^", "%5E") + "?period1=" + period1 + "&period2=" + period2
                + "&interval=1d&includeAdjustedClose=true");
    }

    /** Dates come from the exchange's own time zone; null closes (holidays, unfinished bars) are skipped. */
    static List<MvPoint> parse(JsonNode root, boolean adjusted) {
        JsonNode chart = root.path("chart");
        JsonNode error = chart.path("error");
        if (!error.isMissingNode() && !error.isNull()) {
            throw new IllegalStateException("Yahoo 返回错误：" + error.path("description").asText(error.toString()));
        }
        JsonNode result = chart.path("result").path(0);
        if (result.isMissingNode() || result.isNull()) throw new IllegalStateException("Yahoo 响应没有 result");

        ZoneId zone = ZoneId.of(result.path("meta").path("exchangeTimezoneName").asText("America/New_York"));
        JsonNode timestamps = result.path("timestamp");
        JsonNode closes = adjusted
                ? result.path("indicators").path("adjclose").path(0).path("adjclose")
                : result.path("indicators").path("quote").path(0).path("close");

        TreeMap<LocalDate, Double> byDate = new TreeMap<>();
        for (int i = 0; i < timestamps.size() && i < closes.size(); i++) {
            JsonNode close = closes.get(i);
            if (close == null || close.isNull() || !close.isNumber() || !Double.isFinite(close.doubleValue())) continue;
            LocalDate date = Instant.ofEpochSecond(timestamps.get(i).asLong()).atZone(zone).toLocalDate();
            byDate.put(date, close.doubleValue());
        }
        List<MvPoint> out = new ArrayList<>(byDate.size());
        byDate.forEach((d, v) -> out.add(new MvPoint(d, v, false)));
        return out;
    }
}
