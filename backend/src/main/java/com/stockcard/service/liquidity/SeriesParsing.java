package com.stockcard.service.liquidity;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Parsing helpers shared by the source clients. */
final class SeriesParsing {

    private SeriesParsing() {}

    /** Reads a JSON number or numeric string; null, "", "null" and FRED's "." all mean "missing". */
    static Double number(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) return null;
        if (node.isNumber()) return finite(node.doubleValue());
        String text = node.asText("").trim();
        if (text.isEmpty() || text.equals(".") || text.equalsIgnoreCase("null")) return null;
        try {
            return finite(Double.parseDouble(text));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Double finite(double v) {
        return Double.isNaN(v) || Double.isInfinite(v) ? null : v;
    }

    static LocalDate date(JsonNode node) {
        if (node == null || node.isNull()) return null;
        try {
            return LocalDate.parse(node.asText());
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** Collects points per series code; a later value for the same date overwrites the earlier one. */
    static final class Collector {
        private final Map<String, TreeMap<LocalDate, Double>> data = new LinkedHashMap<>();

        void put(String code, LocalDate date, Double value) {
            if (date == null || value == null) return;
            data.computeIfAbsent(code, k -> new TreeMap<>()).put(date, value);
        }

        void putAll(Map<String, List<SeriesPoint>> series) {
            series.forEach((code, points) -> points.forEach(p -> put(code, p.date(), p.value())));
        }

        Map<String, List<SeriesPoint>> build() {
            Map<String, List<SeriesPoint>> out = new LinkedHashMap<>();
            data.forEach((code, points) -> {
                List<SeriesPoint> list = new ArrayList<>(points.size());
                points.forEach((d, v) -> list.add(new SeriesPoint(d, v)));
                out.put(code, list);
            });
            return out;
        }
    }
}
