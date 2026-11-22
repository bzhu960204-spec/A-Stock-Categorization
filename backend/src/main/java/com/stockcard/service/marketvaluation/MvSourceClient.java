package com.stockcard.service.marketvaluation;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public interface MvSourceClient {

    MvSource source();

    /** Returns seriesCode -> observations. Only fetches and parses; never touches the database. */
    Map<String, List<MvPoint>> fetch(LocalDate from, LocalDate to, FetchMode mode);

    /**
     * As {@link #fetch}, reporting each step through {@code progress} and listing the parts that failed instead of throwing.
     * Clients with several independent requests override this; the sink may throw to abort (deadline exceeded).
     */
    default MvFetchResult fetchDetailed(LocalDate from, LocalDate to, FetchMode mode, SyncProgress progress) {
        return MvFetchResult.of(fetch(from, to, mode));
    }

    @FunctionalInterface
    interface SyncProgress {
        SyncProgress NONE = (step, total, label) -> { };

        void onStep(int step, int total, String label);
    }
}
