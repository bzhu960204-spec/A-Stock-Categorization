package com.stockcard.service.marketvaluation;

import com.stockcard.entity.MvFactsetReport;
import com.stockcard.entity.MvFetchLog;
import com.stockcard.repository.MvFactsetReportRepository;
import com.stockcard.repository.MvFetchLogRepository;
import com.stockcard.repository.MvObservationRepository;
import com.stockcard.service.liquidity.MissingApiKeyException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

@DataJpaTest
class MvSyncServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 22); // a Sunday
    private static final LocalDate PRICE_START = LocalDate.of(1990, 1, 1);
    private static final LocalDate FACTSET_START = LocalDate.of(2026, 10, 2);
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-22T10:00:00Z"), ZoneOffset.UTC);

    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager txManager;
    @Autowired MvFetchLogRepository logRepo;
    @Autowired MvObservationRepository obsRepo;
    @Autowired MvFactsetReportRepository factsetRepo;

    private ExecutorService executor;
    private final FactsetClient factset = mock(FactsetClient.class);

    /** Runs submitted work on the calling thread so everything stays inside the test transaction (nothing leaks into other tests). */
    private static final class DirectExecutor extends java.util.concurrent.AbstractExecutorService {
        private boolean shutdown;

        @Override public void shutdown() { shutdown = true; }
        @Override public List<Runnable> shutdownNow() { shutdown = true; return List.of(); }
        @Override public boolean isShutdown() { return shutdown; }
        @Override public boolean isTerminated() { return shutdown; }
        @Override public boolean awaitTermination(long timeout, java.util.concurrent.TimeUnit unit) { return true; }
        @Override public void execute(Runnable command) { command.run(); }
    }

    @BeforeEach
    void setUp() {
        executor = new DirectExecutor();
    }

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    /** A scripted client that records the range it was asked for. */
    private static class FakeClient implements MvSourceClient {
        final MvSource source;
        final java.util.function.BiFunction<LocalDate, LocalDate, MvFetchResult> behaviour;
        final List<LocalDate[]> calls = new ArrayList<>();

        FakeClient(MvSource source, java.util.function.BiFunction<LocalDate, LocalDate, MvFetchResult> behaviour) {
            this.source = source;
            this.behaviour = behaviour;
        }

        @Override public MvSource source() { return source; }

        @Override public Map<String, List<MvPoint>> fetch(LocalDate from, LocalDate to, FetchMode mode) {
            return fetchDetailed(from, to, mode, SyncProgress.NONE).points();
        }

        @Override public MvFetchResult fetchDetailed(LocalDate from, LocalDate to, FetchMode mode, SyncProgress progress) {
            calls.add(new LocalDate[]{from, to});
            return behaviour.apply(from, to);
        }
    }

    private MvSyncService service(MvSourceClient... clients) {
        return new MvSyncService(List.of(clients), factset, jdbc, txManager, logRepo, obsRepo, factsetRepo, executor,
                PRICE_START, FACTSET_START, 60, Duration.ofHours(6), true, CLOCK);
    }

    private static MvFetchResult spx(double value, boolean estimate) {
        return MvFetchResult.of(Map.of("SPX_CAPE_SPOT", List.of(new MvPoint(LocalDate.of(2026, 11, 19), value, estimate),
                new MvPoint(LocalDate.of(2026, 11, 20), value, estimate))));
    }

    private long rowCount() {
        return jdbc.queryForObject("select count(*) from mv_observation", Long.class);
    }

    private Double stored(String code, String date) {
        return jdbc.queryForObject("select obs_value from mv_observation where series_code = ? and obs_date = ?", Double.class, code, java.sql.Date.valueOf(date));
    }

    @Test
    void syncingTwiceIsIdempotentTheLaterValueWinsAndTheEstimateFlagIsStored() {
        double[] value = {36.4};
        FakeClient multpl = new FakeClient(MvSource.MULTPL, (f, t) -> spx(value[0], true));
        MvSyncService service = service(multpl);

        service.sync(FetchMode.INCREMENTAL, null);
        value[0] = 36.5;
        service.sync(FetchMode.INCREMENTAL, null);

        assertThat(rowCount()).isEqualTo(2);
        assertThat(stored("SPX_CAPE_SPOT", "2026-11-19")).isEqualTo(36.5);
        assertThat(jdbc.queryForObject("select estimate from mv_observation where obs_date = ?", Boolean.class, java.sql.Date.valueOf("2026-11-19"))).isTrue();
        assertThat(logRepo.findFirstBySourceOrderByIdDesc("MULTPL").orElseThrow().getRowsUpserted()).isEqualTo(2);
    }

    @Test
    void oneFailingSourceDoesNotStopTheOthersAndSecretsAreRedacted() {
        FakeClient failing = new FakeClient(MvSource.YAHOO, (f, t) -> { throw new IllegalStateException("boom api_key=SECRET"); });
        FakeClient multpl = new FakeClient(MvSource.MULTPL, (f, t) -> spx(36.4, false));

        service(failing, multpl).sync(FetchMode.INCREMENTAL, null);

        MvFetchLog failed = logRepo.findFirstBySourceOrderByIdDesc("YAHOO").orElseThrow();
        assertThat(failed.getStatus()).isEqualTo("FAILED");
        assertThat(failed.getMessage()).contains("boom").doesNotContain("SECRET");
        assertThat(logRepo.findFirstBySourceOrderByIdDesc("MULTPL").orElseThrow().getStatus()).isEqualTo("SUCCESS");
        assertThat(stored("SPX_CAPE_SPOT", "2026-11-19")).isEqualTo(36.4);
    }

    @Test
    void partialResultsAreStoredAndLoggedAsPartial() {
        FakeClient wpr = new FakeClient(MvSource.WPR, (f, t) -> new MvFetchResult(
                Map.of("WPE_SPX", List.of(new MvPoint(LocalDate.of(2026, 11, 20), 22.55, false))), List.of("CN: 页面结构可能已变化")));

        service(wpr).sync(FetchMode.INCREMENTAL, null);

        MvFetchLog entry = logRepo.findFirstBySourceOrderByIdDesc("WPR").orElseThrow();
        assertThat(entry.getStatus()).isEqualTo("PARTIAL");
        assertThat(entry.getMessage()).contains("CN");
        assertThat(stored("WPE_SPX", "2026-11-20")).isEqualTo(22.55);
    }

    @Test
    void aMissingApiKeyIsRecordedAsSkippedNotFailed() {
        FakeClient fred = new FakeClient(MvSource.FRED, (f, t) -> { throw new MissingApiKeyException("未配置 FRED API Key"); });

        service(fred).sync(FetchMode.INCREMENTAL, null);

        assertThat(logRepo.findFirstBySourceOrderByIdDesc("FRED").orElseThrow().getStatus()).isEqualTo("SKIPPED");
    }

    @Test
    void anUnsupportedSourceIsRejectedWithoutLeavingTheLockHeld() {
        FakeClient multpl = new FakeClient(MvSource.MULTPL, (f, t) -> spx(36.4, false));
        MvSyncService service = service(multpl);

        assertThatThrownBy(() -> service.sync(FetchMode.FULL, MvSource.MANUAL)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.sync(FetchMode.FULL, MvSource.YAHOO)).isInstanceOf(ResponseStatusException.class);
        service.sync(FetchMode.INCREMENTAL, MvSource.MULTPL);
        assertThat(multpl.calls).hasSize(1);
    }

    @Test
    void aSecondSyncWhileOneIsRunningIsRejectedWith409() {
        MvSyncService[] holder = new MvSyncService[1];
        ResponseStatusException[] rejected = new ResponseStatusException[1];
        FakeClient reentrant = new FakeClient(MvSource.MULTPL, (f, t) -> {
            try {
                holder[0].sync(FetchMode.INCREMENTAL, null);
            } catch (ResponseStatusException e) {
                rejected[0] = e;
            }
            return MvFetchResult.of(Map.of());
        });
        holder[0] = service(reentrant);

        holder[0].sync(FetchMode.INCREMENTAL, null);

        assertThat(rejected[0].getStatusCode().value()).isEqualTo(409);
        assertThat(holder[0].isRunning()).isFalse();
    }

    @Test
    void incrementalStartsAtTheOldestLatestDateMinusItsLookbackAndFullAtTheHistoryStart() {
        MvSyncService service = service();
        for (MvSeries s : MvSeries.rawOf(MvSource.YAHOO)) {
            jdbc.update("insert into mv_observation (series_code, obs_date, obs_value, source, estimate, fetched_at) values (?, ?, 1, 'YAHOO', false, now())",
                    s.code(), java.sql.Date.valueOf(s.code().equals("PX_RSP") ? "2026-11-10" : "2026-11-20"));
        }

        assertThat(service.resolveFrom(MvSource.YAHOO, FetchMode.INCREMENTAL)).isEqualTo(LocalDate.of(2026, 10, 31));
        assertThat(service.resolveFrom(MvSource.YAHOO, FetchMode.FULL)).isEqualTo(PRICE_START);
        assertThat(service.resolveFrom(MvSource.FRED, FetchMode.INCREMENTAL)).isEqualTo(LocalDate.of(1945, 1, 1)); // nothing stored yet
    }

    @Test
    void refreshIfStaleTriggersOnlyWhenTheLastSuccessIsOldAndNothingRuns() throws Exception {
        FakeClient multpl = new FakeClient(MvSource.MULTPL, (f, t) -> spx(36.4, false));
        MvSyncService service = service(multpl);

        MvSyncService.RefreshResult first = service.refreshIfStale(); // never synced
        MvSyncService.RefreshResult second = service.refreshIfStale(); // just succeeded

        assertThat(first.triggered()).isTrue();
        assertThat(second.triggered()).isFalse();
        assertThat(second.lastSuccessAt()).isNotNull();
        assertThat(multpl.calls).hasSize(1);

        MvFetchLog old = logRepo.findFirstByStatusInOrderByIdDesc(List.of("SUCCESS")).orElseThrow();
        old.setFinishedAt(LocalDateTime.now(CLOCK).minusHours(7));
        logRepo.saveAndFlush(old);
        logRepo.findAll().forEach(l -> { l.setFinishedAt(LocalDateTime.now(CLOCK).minusHours(7)); logRepo.save(l); });
        logRepo.flush();
        assertThat(service.refreshIfStale().triggered()).isTrue();
        assertThat(multpl.calls).hasSize(2);
    }

    @Test
    void refreshIfStaleDoesNothingWhileASyncIsRunning() {
        MvSyncService[] holder = new MvSyncService[1];
        MvSyncService.RefreshResult[] seen = new MvSyncService.RefreshResult[1];
        FakeClient reentrant = new FakeClient(MvSource.MULTPL, (f, t) -> {
            seen[0] = holder[0].refreshIfStale();
            return MvFetchResult.of(Map.of());
        });
        holder[0] = service(reentrant);

        holder[0].sync(FetchMode.INCREMENTAL, null);

        assertThat(seen[0].triggered()).isFalse();
    }

    @Test
    void recoverInterruptedRunsMarksLeftoverRunningRowsFailed() {
        MvFetchLog orphan = new MvFetchLog();
        orphan.setSource("FRED");
        orphan.setMode("FULL");
        orphan.setStartedAt(LocalDateTime.now(CLOCK).minusHours(3));
        orphan.setStatus("RUNNING");
        orphan = logRepo.save(orphan);

        service().recoverInterruptedRuns();

        MvFetchLog recovered = logRepo.findById(orphan.getId()).orElseThrow();
        assertThat(recovered.getStatus()).isEqualTo("FAILED");
        assertThat(recovered.getMessage()).isEqualTo(MvSyncService.INTERRUPTED_MESSAGE);
    }

    // ---- FactSet bookkeeping ----

    private void book(String friday, String status) {
        MvFactsetReport r = new MvFactsetReport();
        r.setWeekFriday(LocalDate.parse(friday));
        r.setStatus(status);
        r.setFetchedAt(LocalDateTime.now(CLOCK));
        factsetRepo.save(r);
    }

    @Test
    void incrementalPlanRetriesRecentGapsAndNotFoundOnlyWithinThreeWeeks() {
        // Fridays since 2026-10-02: 11-20, 11-13, 11-06, 10-30, 10-23, 10-16, 10-09, 10-02; "recent" = since 2026-09-27 -> all of them.
        book("2026-11-20", "NOT_FOUND");   // within 3 weeks -> retried
        book("2026-11-13", "PARSED");      // done
        book("2026-11-06", "NOT_FOUND");   // 2026-11-01 or later -> retried
        book("2026-10-30", "NOT_FOUND");   // older than 3 weeks -> left alone
        book("2026-10-23", "PARSE_FAILED"); // retried
        // 10-16, 10-09, 10-02 unrecorded -> processed

        List<LocalDate> plan = service().planFactsetWeeks(FetchMode.INCREMENTAL, TODAY);

        assertThat(plan).containsExactly(LocalDate.of(2026, 11, 20), LocalDate.of(2026, 11, 6), LocalDate.of(2026, 10, 23),
                LocalDate.of(2026, 10, 16), LocalDate.of(2026, 10, 9), LocalDate.of(2026, 10, 2));
    }

    @Test
    void fullPlanTakesUnrecordedAndFailedWeeksAndIsCappedPerRun() {
        book("2026-11-20", "PARSED");
        book("2026-11-13", "NOT_FOUND");
        book("2026-11-06", "PARSE_FAILED");
        MvSyncService capped = new MvSyncService(List.of(), factset, jdbc, txManager, logRepo, obsRepo, factsetRepo, executor,
                PRICE_START, FACTSET_START, 3, Duration.ofHours(6), true, CLOCK);

        assertThat(capped.planFactsetWeeks(FetchMode.FULL, TODAY)).containsExactly(
                LocalDate.of(2026, 11, 6), LocalDate.of(2026, 10, 30), LocalDate.of(2026, 10, 23));
        assertThat(service().planFactsetWeeks(FetchMode.FULL, TODAY)).doesNotContain(LocalDate.of(2026, 11, 13), LocalDate.of(2026, 11, 20));
    }

    @Test
    void factsetResultsAreStoredWithTheirBookkeepingAndProgressIsReported() {
        doAnswer(inv -> {
            List<LocalDate> weeks = inv.getArgument(0);
            Consumer<FactsetClient.WeekResult> sink = inv.getArgument(2);
            sink.accept(new FactsetClient.WeekResult(weeks.get(0), "PARSED", LocalDate.of(2026, 11, 20), "EarningsInsight_112026A.pdf", "Q3 2026",
                    "missing: FS_TTM_PE", Map.of("FS_FWD_PE", 17.1, "FS_EPS_G_Q", 32.9)));
            sink.accept(new FactsetClient.WeekResult(weeks.get(1), "NOT_FOUND", null, null, null, null, Map.of()));
            return null;
        }).when(factset).fetchWeeks(any(), any(), any());
        MvSyncService service = new MvSyncService(List.of(), factset, jdbc, txManager, logRepo, obsRepo, factsetRepo, executor,
                PRICE_START, LocalDate.of(2026, 11, 13), 60, Duration.ofHours(6), true, CLOCK);

        service.sync(FetchMode.INCREMENTAL, MvSource.FACTSET);

        assertThat(stored("FS_FWD_PE", "2026-11-20")).isEqualTo(17.1);
        assertThat(stored("FS_EPS_G_Q", "2026-11-20")).isEqualTo(32.9);
        MvFactsetReport parsed = factsetRepo.findById(LocalDate.of(2026, 11, 20)).orElseThrow();
        assertThat(parsed.getStatus()).isEqualTo("PARSED");
        assertThat(parsed.getFiscalQuarter()).isEqualTo("Q3 2026");
        assertThat(parsed.getMessage()).isEqualTo("missing: FS_TTM_PE");
        assertThat(factsetRepo.findById(LocalDate.of(2026, 11, 13)).orElseThrow().getStatus()).isEqualTo("NOT_FOUND");
        MvFetchLog entry = logRepo.findFirstBySourceOrderByIdDesc("FACTSET").orElseThrow();
        assertThat(entry.getStatus()).isEqualTo("SUCCESS");
        assertThat(entry.getRowsUpserted()).isEqualTo(2);
        assertThat(service.factsetProgress()).containsEntry("processedWeeks", 2).containsEntry("totalWeeks", 2);
    }

    @Test
    void retryingAWeekForgetsItsBookkeepingAndRejectsNonFridays() throws Exception {
        book("2026-11-20", "PARSE_FAILED");
        MvSyncService service = service();

        assertThatThrownBy(() -> service.retryFactsetWeek(LocalDate.of(2026, 11, 19))).isInstanceOf(IllegalArgumentException.class);
        service.retryFactsetWeek(LocalDate.of(2026, 11, 20));

        assertThat(factsetRepo.findById(LocalDate.of(2026, 11, 20))).isEmpty();
        org.mockito.Mockito.verify(factset).fetchWeeks(org.mockito.ArgumentMatchers.eq(List.of(LocalDate.of(2026, 11, 20))), any(), any());
    }
}
