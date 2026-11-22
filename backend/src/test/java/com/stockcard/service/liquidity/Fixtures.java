package com.stockcard.service.liquidity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Loads the recorded API responses under src/test/resources/liquidity (tests never touch the network). */
final class Fixtures {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private Fixtures() {}

    static JsonNode json(String name) {
        try (InputStream in = Fixtures.class.getResourceAsStream("/liquidity/" + name)) {
            if (in == null) throw new IllegalStateException("Missing fixture " + name);
            return MAPPER.readTree(in);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    static SeriesPoint pt(String date, double value) {
        return new SeriesPoint(LocalDate.parse(date), value);
    }

    /** The value of {@code code} on {@code date}, or null. */
    static Double valueOn(Map<String, List<SeriesPoint>> series, String code, String date) {
        return series.getOrDefault(code, List.of()).stream()
                .filter(p -> p.date().equals(LocalDate.parse(date))).map(SeriesPoint::value).findFirst().orElse(null);
    }
}
