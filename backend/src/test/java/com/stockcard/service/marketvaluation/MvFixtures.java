package com.stockcard.service.marketvaluation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockcard.service.liquidity.SeriesPoint;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Loads the recorded responses under src/test/resources/market-valuation (tests never touch the network). */
final class MvFixtures {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private MvFixtures() {}

    static String text(String name) {
        try (InputStream in = MvFixtures.class.getResourceAsStream("/market-valuation/" + name)) {
            if (in == null) throw new IllegalStateException("Missing fixture " + name);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    static JsonNode json(String name) {
        try {
            return MAPPER.readTree(text(name));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    static SeriesPoint pt(String date, double value) {
        return new SeriesPoint(LocalDate.parse(date), value);
    }

    static MvPoint find(Map<String, List<MvPoint>> series, String code, String date) {
        return series.getOrDefault(code, List.of()).stream().filter(p -> p.date().equals(LocalDate.parse(date))).findFirst().orElse(null);
    }

    static Double value(List<SeriesPoint> series, String date) {
        return series.stream().filter(p -> p.date().equals(LocalDate.parse(date))).map(SeriesPoint::value).findFirst().orElse(null);
    }
}
