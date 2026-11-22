package com.stockcard.service.liquidity;

import com.fasterxml.jackson.databind.JsonNode;
import com.stockcard.service.AppConfigService;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** FRED (St. Louis Fed) API: IORB/IOER, reserves, bank and Fed assets, credit spread, stress and policy series (design §4.2). Needs a free key. */
@Component
public class FredClient implements LiquiditySourceClient {

    private static final String BASE = "https://api.stlouisfed.org/fred";
    private static final LocalDate IOER_LAST_DAY = LocalDate.of(2021, 7, 28);
    private static final LocalDate IORB_FIRST_DAY = LocalDate.of(2021, 7, 29);

    /** One FRED series feeding one of our series; IOER and IORB are two FRED series merged into IORB. */
    private record Spec(String code, String fredId, LocalDate firstDay, LocalDate lastDay) {
        Spec(String code, String fredId) {
            this(code, fredId, null, null);
        }
    }

    private static final List<Spec> SPECS = List.of(
            new Spec("IORB", "IOER", null, IOER_LAST_DAY),
            new Spec("IORB", "IORB", IORB_FIRST_DAY, null),
            new Spec("RESERVES", "WRESBAL"),
            new Spec("BANK_ASSETS", "TLAACBW027SBOG"),
            new Spec("FED_ASSETS", "WALCL"),
            new Spec("HY_OAS", "BAMLH0A0HYM2"),
            new Spec("STLFSI4", "STLFSI4"),
            new Spec("NFCI", "NFCI"),
            new Spec("VIX", "VIXCLS"),
            new Spec("SAHM", "SAHMREALTIME"),
            new Spec("UST2Y", "DGS2"),
            new Spec("PRIMARY_CREDIT", "WLCFLPCL"),
            new Spec("CB_SWAPS", "SWPT"),
            new Spec("FED_REPO", "WORAL"));

    private final LiquidityHttp http;
    private final AppConfigService config;
    /** A series' unit never changes, so the metadata request is made once per series, not on every sync. */
    private final Map<String, Double> divisors = new ConcurrentHashMap<>();

    public FredClient(LiquidityHttp http, AppConfigService config) {
        this.http = http;
        this.config = config;
    }

    @Override
    public LiquiditySource source() {
        return LiquiditySource.FRED;
    }

    @Override
    public Map<String, List<SeriesPoint>> fetch(LocalDate from, LocalDate to) {
        return fetch(from, to, SyncProgress.NONE);
    }

    @Override
    public Map<String, List<SeriesPoint>> fetch(LocalDate from, LocalDate to, SyncProgress progress) {
        String key = config.resolveFredApiKey();
        if (key.isBlank()) throw new MissingApiKeyException("未配置 FRED API Key");

        SeriesParsing.Collector all = new SeriesParsing.Collector();
        for (int i = 0; i < SPECS.size(); i++) {
            Spec spec = SPECS.get(i);
            LocalDate start = spec.firstDay() != null && spec.firstDay().isAfter(from) ? spec.firstDay() : from;
            LocalDate end = spec.lastDay() != null && spec.lastDay().isBefore(to) ? spec.lastDay() : to;
            if (start.isAfter(end)) continue;

            progress.onStep(i + 1, SPECS.size(), spec.fredId());
            double divisor = divisors.computeIfAbsent(spec.fredId(), id -> unitDivisor(http.getJson(seriesUri(id, key))));
            JsonNode obs = http.getJson(observationsUri(spec.fredId(), key, start, end));
            for (SeriesPoint p : parseObservations(obs, divisor)) {
                if (!p.date().isBefore(start) && !p.date().isAfter(end)) all.put(spec.code(), p.date(), p.value());
            }
        }
        return all.build();
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

    /** Divisor that converts a series to billions: "Millions of ..." / 1000; Billions and Percent are kept as-is. */
    public static double unitDivisor(JsonNode seriesResponse) {
        String units = seriesResponse.path("seriess").path(0).path("units").asText("");
        return units.contains("Millions") ? 1000.0 : 1.0;
    }

    /** Parses {@code observations[]}; FRED's missing value "." is skipped. */
    public static List<SeriesPoint> parseObservations(JsonNode root, double divisor) {
        List<SeriesPoint> out = new ArrayList<>();
        for (JsonNode o : root.path("observations")) {
            LocalDate date = SeriesParsing.date(o.get("date"));
            Double value = SeriesParsing.number(o.get("value"));
            if (date != null && value != null) out.add(new SeriesPoint(date, value / divisor));
        }
        return out;
    }
}
