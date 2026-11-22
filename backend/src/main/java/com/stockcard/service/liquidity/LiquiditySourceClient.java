package com.stockcard.service.liquidity;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public interface LiquiditySourceClient {

    LiquiditySource source();

    /** Returns seriesCode -> observations. Only fetches and parses; never touches the database. */
    Map<String, List<SeriesPoint>> fetch(LocalDate from, LocalDate to);

    /**
     * As {@link #fetch(LocalDate, LocalDate)}, reporting each step through {@code progress} (e.g. {@code onStep(3, 14, "WRESBAL")}).
     * The sink may throw to abort the fetch (deadline exceeded); clients without discrete steps just ignore it.
     */
    default Map<String, List<SeriesPoint>> fetch(LocalDate from, LocalDate to, SyncProgress progress) {
        return fetch(from, to);
    }

    @FunctionalInterface
    interface SyncProgress {
        SyncProgress NONE = (step, total, label) -> { };

        void onStep(int step, int total, String label);
    }
}
