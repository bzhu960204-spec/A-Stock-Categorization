package com.stockcard.service.marketvaluation;

import java.util.List;
import java.util.Map;

/** What a client fetched plus the parts that failed ("PARTIAL": the rest is still stored). */
public record MvFetchResult(Map<String, List<MvPoint>> points, List<String> warnings) {

    public static MvFetchResult of(Map<String, List<MvPoint>> points) {
        return new MvFetchResult(points, List.of());
    }
}
