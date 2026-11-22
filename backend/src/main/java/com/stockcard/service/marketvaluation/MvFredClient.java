package com.stockcard.service.marketvaluation;

import com.fasterxml.jackson.databind.JsonNode;
import com.stockcard.service.AppConfigService;
import com.stockcard.service.liquidity.FredClient;
import com.stockcard.service.liquidity.MissingApiKeyException;
import com.stockcard.service.liquidity.SeriesPoint;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** FRED: GDP, Z.1 equity market values, corporate profits and the 10-year yields (design §3.1.5, §4.5). Needs the shared free key. */
@Component
public class MvFredClient implements MvSourceClient {

    private static final String BASE = "https://api.stlouisfed.org/fred";

    /** {@code stockSeries}: Z.1 levels are dated the first day of the quarter but hold the quarter-end stock, so they move to quarter end. */
    private record Spec(String code, String fredId, boolean stockSeries) {}

    private static final List<Spec> SPECS = List.of(
            new Spec("GDP", "GDP", false),
            new Spec("EQ_NONFIN", "NCBEILQ027S", true),
            new Spec("EQ_FIN", "FBCELLQ027S", true),
            new Spec("NW_NONFIN", "TNWMVBSNNCB", true),
            new Spec("CP_AFTER_TAX", "CPATAX", false),
            new Spec("UST10Y", "DGS10", false),
            new Spec("TIPS10Y", "DFII10", false));

    private final MvHttp http;
    private final AppConfigService config;
    /** A series' unit never changes, so the metadata request is made once per series, not on every sync. */
    private final Map<String, Double> divisors = new ConcurrentHashMap<>();

    public MvFredClient(MvHttp http, AppConfigService config) {
        this.http = http;
        this.config = config;
    }

    @Override
    public MvSource source() {
        return MvSource.FRED;
    }

    @Override
    public Map<String, List<MvPoint>> fetch(LocalDate from, LocalDate to, FetchMode mode) {
        return fetchDetailed(from, to, mode, SyncProgress.NONE).points();
    }

    /** A series FRED rejects (e.g. an ID that does not exist) is reported as a warning and does not stop the others. */
    @Override
    public MvFetchResult fetchDetailed(LocalDate from, LocalDate to, FetchMode mode, SyncProgress progress) {
        String key = config.resolveFredApiKey();
        if (key.isBlank()) throw new MissingApiKeyException("未配置 FRED API Key");

        Map<String, List<MvPoint>> out = new LinkedHashMap<>();
        List<String> warnings = new ArrayList<>();
        for (int i = 0; i < SPECS.size(); i++) {
            Spec spec = SPECS.get(i);
            progress.onStep(i + 1, SPECS.size(), spec.fredId());
            try {
                double divisor = divisors.computeIfAbsent(spec.fredId(), id -> FredClient.unitDivisor(http.getJson(seriesUri(id, key))));
                JsonNode obs = http.getJson(observationsUri(spec.fredId(), key, from, to));
                out.put(spec.code(), toPoints(FredClient.parseObservations(obs, divisor), spec.stockSeries()));
            } catch (RuntimeException e) {
                warnings.add(spec.fredId() + ": " + MvHttp.redact(e.getMessage()));
            }
        }
        if (out.isEmpty()) throw new IllegalStateException("FRED 全部序列失败：" + String.join("；", warnings));
        return new MvFetchResult(out, warnings);
    }

    static List<MvPoint> toPoints(List<SeriesPoint> parsed, boolean stockSeries) {
        List<MvPoint> out = new ArrayList<>(parsed.size());
        for (SeriesPoint p : parsed) {
            LocalDate date = stockSeries ? p.date().plusMonths(3).minusDays(1) : p.date();
            out.add(new MvPoint(date, p.value(), false));
        }
        return out;
    }

    private static URI seriesUri(String fredId, String key) {
        return URI.create(BASE + "/series?series_id=" + fredId + "&api_key=" + encode(key) + "&file_type=json");
    }

    private static URI observationsUri(String fredId, String key, LocalDate start, LocalDate end) {
        return URI.create(BASE + "/series/observations?series_id=" + fredId + "&api_key=" + encode(key)
                + "&file_type=json&observation_start=" + start + "&observation_end=" + end);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
