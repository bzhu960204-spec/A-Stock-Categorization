package com.stockcard.service.liquidity;

import com.stockcard.entity.LiquidityFetchLog;
import com.stockcard.repository.LiquidityFetchLogRepository;
import com.stockcard.repository.LiquidityObservationRepository;
import com.stockcard.service.liquidity.qe.FedTextService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.BiFunction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@DataJpaTest
class LiquiditySyncServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 22);
    private static final LocalDate HISTORY_START = LocalDate.of(2018, 4, 1);
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-22T10:00:00Z"), ZoneOffset.UTC);

    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager txManager;
    @Autowired LiquidityFetchLogRepository logRepo;
    @Autowired LiquidityObservationRepository obsRepo;

    private ExecutorService executor;

    @BeforeEach
    void setUp() {
        executor = Executors.newSingleThreadExecutor();
    }

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    /** A scripted client that records the range it was asked for. */
    private static class FakeClient implements LiquiditySourceClient {
        final LiquiditySource source;
        final BiFunction<LocalDate, LocalDate, Map<String, List<SeriesPoint>>> behaviour;
        final List<LocalDate[]> calls = new ArrayList<>();

        FakeClient(LiquiditySource source, BiFunction<LocalDate, LocalDate, Map<String, List<SeriesPoint>>> behaviour) {
            this.source = source;
            this.behaviour = behaviour;
        }

        @Override public LiquiditySource source() { return source; }

        @Override public Map<String, List<SeriesPoint>> fetch(LocalDate from, LocalDate to) {
            calls.add(new LocalDate[]{from, to});
            return behaviour.apply(from, to);
        }
    }

    private final FedTextService fedText = mock(FedTextService.class);
    private final List<Object> published = new ArrayList<>();

    private LiquiditySyncService service(LiquiditySourceClient... clients) {
        return new LiquiditySyncService(List.of(clients), jdbc, txManager, logRepo, obsRepo, fedText, published::add, executor,
                HISTORY_START, true, CLOCK);
    }

    private static Map<String, List<SeriesPoint>> sofr(double value) {
        return Map.of("SOFR", List.of(new SeriesPoint(LocalDate.of(2026, 11, 19), value), new SeriesPoint(LocalDate.of(2026, 11, 20), value)));
    }

    private Double stored(String code, String date) {
        return jdbc.queryForObject("select obs_value from liquidity_observation where series_code = ? and obs_date = ?",
                Double.class, code, java.sql.Date.valueOf(date));
    }

    private long rowCount() {
        return jdbc.queryForObject("select count(*) from liquidity_observation", Long.class);
    }

    @Test
    void syncingTwiceIsIdempotentAndTheLaterValueWins() {
        double[] value = {3.91};
        FakeClient nyfed = new FakeClient(LiquiditySource.NYFED, (f, t) -> sofr(value[0]));
        LiquiditySyncService service = service(nyfed);

        service.sync(LiquiditySyncService.Mode.INCREMENTAL);
        assertThat(rowCount()).isEqualTo(2);

        value[0] = 3.95; // a revised value
        service.sync(LiquiditySyncService.Mode.INCREMENTAL);

        assertThat(rowCount()).isEqualTo(2);
        assertThat(stored("SOFR", "2026-11-19")).isEqualTo(3.95);
        assertThat(logRepo.findFirstBySourceOrderByIdDesc("NYFED").orElseThrow().getRowsUpserted()).isEqualTo(2);
    }

    @Test
    void oneFailingSourceDoesNotStopTheOthers() {
        FakeClient failing = new FakeClient(LiquiditySource.NYFED, (f, t) -> { throw new IllegalStateException("boom api_key=SECRET"); });
        FakeClient treasury = new FakeClient(LiquiditySource.TREASURY,
                (f, t) -> Map.of("TGA", List.of(new SeriesPoint(LocalDate.of(2026, 11, 19), 891.223))));

        service(failing, treasury).sync(LiquiditySyncService.Mode.INCREMENTAL);

        LiquidityFetchLog failed = logRepo.findFirstBySourceOrderByIdDesc("NYFED").orElseThrow();
        assertThat(failed.getStatus()).isEqualTo("FAILED");
        assertThat(failed.getMessage()).contains("boom").doesNotContain("SECRET");
        assertThat(logRepo.findFirstBySourceOrderByIdDesc("TREASURY").orElseThrow().getStatus()).isEqualTo("SUCCESS");
        assertThat(stored("TGA", "2026-11-19")).isEqualTo(891.223);
    }

    @Test
    void aMissingApiKeyIsRecordedAsSkippedNotFailed() {
        FakeClient fred = new FakeClient(LiquiditySource.FRED, (f, t) -> { throw new MissingApiKeyException("未配置 FRED API Key"); });

        service(fred).sync(LiquiditySyncService.Mode.INCREMENTAL);

        LiquidityFetchLog entry = logRepo.findFirstBySourceOrderByIdDesc("FRED").orElseThrow();
        assertThat(entry.getStatus()).isEqualTo("SKIPPED");
        assertThat(entry.getMessage()).contains("FRED");
        assertThat(entry.getFinishedAt()).isNotNull();
    }

    @Test
    void syncingASingleSourceLeavesTheOthersUntouched() {
        FakeClient nyfed = new FakeClient(LiquiditySource.NYFED, (f, t) -> sofr(3.91));
        FakeClient treasury = new FakeClient(LiquiditySource.TREASURY, (f, t) -> Map.of());
        LiquiditySyncService service = service(nyfed, treasury);

        service.sync(LiquiditySyncService.Mode.FULL, LiquiditySource.NYFED);

        assertThat(nyfed.calls).hasSize(1);
        assertThat(treasury.calls).isEmpty();
        assertThat(logRepo.findFirstBySourceOrderByIdDesc("TREASURY")).isEmpty();
        assertThatThrownBy(() -> service.sync(LiquiditySyncService.Mode.FULL, LiquiditySource.MANUAL))
                .isInstanceOf(ResponseStatusException.class);
        service.sync(LiquiditySyncService.Mode.INCREMENTAL); // the rejected request must not leave the lock held
    }

    @Test
    void incrementalStartsTenDaysBeforeTheLatestStoredDateAndFullStartsAtTheHistoryStart() {
        FakeClient nyfed = new FakeClient(LiquiditySource.NYFED, (f, t) -> sofr(3.91));
        LiquiditySyncService service = service(nyfed);

        service.sync(LiquiditySyncService.Mode.INCREMENTAL); // nothing stored yet -> history start
        service.sync(LiquiditySyncService.Mode.INCREMENTAL); // latest stored is 2026-11-20 -> 2026-11-10
        service.sync(LiquiditySyncService.Mode.FULL);

        assertThat(nyfed.calls.get(0)[0]).isEqualTo(HISTORY_START);
        assertThat(nyfed.calls.get(1)[0]).isEqualTo(LocalDate.of(2026, 11, 10));
        assertThat(nyfed.calls.get(1)[1]).isEqualTo(TODAY);
        assertThat(nyfed.calls.get(2)[0]).isEqualTo(HISTORY_START);
    }

    @Test
    void aSecondSyncWhileOneIsRunningIsRejectedWith409() {
        LiquiditySyncService[] holder = new LiquiditySyncService[1];
        ResponseStatusException[] rejected = new ResponseStatusException[1];
        FakeClient reentrant = new FakeClient(LiquiditySource.NYFED, (f, t) -> {
            try {
                holder[0].sync(LiquiditySyncService.Mode.INCREMENTAL);
            } catch (ResponseStatusException e) {
                rejected[0] = e;
            }
            assertThat(holder[0].isRunning()).isTrue();
            return Map.of();
        });
        holder[0] = service(reentrant);

        holder[0].sync(LiquiditySyncService.Mode.INCREMENTAL);

        assertThat(rejected[0]).isNotNull();
        assertThat(rejected[0].getStatusCode().value()).isEqualTo(409);
        assertThat(holder[0].isRunning()).isFalse(); // released afterwards
        assertThat(reentrant.calls).hasSize(1);
    }

    @Test
    void theRunningFlagIsReleasedEvenWhenEveryClientFails() {
        FakeClient failing = new FakeClient(LiquiditySource.NYFED, (f, t) -> { throw new IllegalStateException("down"); });
        LiquiditySyncService service = service(failing);

        service.sync(LiquiditySyncService.Mode.INCREMENTAL);

        assertThat(service.isRunning()).isFalse();
        service.sync(LiquiditySyncService.Mode.INCREMENTAL); // would throw 409 if the flag had leaked
        assertThat(failing.calls).hasSize(2);
    }

    @Test
    void longFailureMessagesAreTruncatedTo1000Characters() {
        FakeClient failing = new FakeClient(LiquiditySource.NYFED, (f, t) -> { throw new IllegalStateException("x".repeat(5000)); });

        service(failing).sync(LiquiditySyncService.Mode.INCREMENTAL);

        assertThat(logRepo.findFirstBySourceOrderByIdDesc("NYFED").orElseThrow().getMessage()).hasSize(1000);
    }

    @Test
    void aFailingFedTextSyncIsLoggedWithoutAffectingTheNumericSourcesAndTheFinishEventIsStillPublished() {
        FakeClient nyfed = new FakeClient(LiquiditySource.NYFED, (f, t) -> sofr(3.91));
        when(fedText.sync(anyBoolean())).thenThrow(new IllegalStateException("正文提取为空，未入库：https://example/x"));

        service(nyfed).sync(LiquiditySyncService.Mode.INCREMENTAL);

        assertThat(logRepo.findFirstBySourceOrderByIdDesc("NYFED").orElseThrow().getStatus()).isEqualTo("SUCCESS");
        LiquidityFetchLog text = logRepo.findFirstBySourceOrderByIdDesc("FEDTEXT").orElseThrow();
        assertThat(text.getStatus()).isEqualTo("FAILED");
        assertThat(text.getMessage()).contains("https://example/x");
        assertThat(published).containsExactly(new LiquiditySyncFinishedEvent(LiquiditySyncService.Mode.INCREMENTAL));
    }

    @Test
    void syncingFedTextAloneSkipsTheNumericSourcesAndRecordsTheNewDocumentCount() {
        FakeClient nyfed = new FakeClient(LiquiditySource.NYFED, (f, t) -> sofr(3.91));
        when(fedText.sync(true)).thenReturn(3);

        service(nyfed).sync(LiquiditySyncService.Mode.FULL, LiquiditySource.FEDTEXT);

        assertThat(nyfed.calls).isEmpty();
        verify(fedText).sync(true);
        assertThat(logRepo.findFirstBySourceOrderByIdDesc("FEDTEXT").orElseThrow().getRowsUpserted()).isEqualTo(3);
    }

    @Test
    void recoverInterruptedRunsMarksLeftoverRunningRowsFailed() {
        LiquidityFetchLog orphan = new LiquidityFetchLog();
        orphan.setSource("FRED");
        orphan.setMode("FULL");
        orphan.setStartedAt(java.time.LocalDateTime.now(CLOCK).minusHours(3));
        orphan.setStatus("RUNNING");
        orphan = logRepo.save(orphan);

        service().recoverInterruptedRuns();

        LiquidityFetchLog recovered = logRepo.findById(orphan.getId()).orElseThrow();
        assertThat(recovered.getStatus()).isEqualTo("FAILED");
        assertThat(recovered.getFinishedAt()).isNotNull();
        assertThat(recovered.getMessage()).isEqualTo(LiquiditySyncService.INTERRUPTED_MESSAGE);
    }

    @Test
    void anErrorThrownByAClientIsRecordedAsFailedBeforeItPropagates() {
        FakeClient broken = new FakeClient(LiquiditySource.NYFED, (f, t) -> { throw new StackOverflowError("deep"); });
        LiquiditySyncService service = service(broken);

        assertThatThrownBy(() -> service.sync(LiquiditySyncService.Mode.INCREMENTAL)).isInstanceOf(StackOverflowError.class);

        LiquidityFetchLog entry = logRepo.findFirstBySourceOrderByIdDesc("NYFED").orElseThrow();
        assertThat(entry.getStatus()).isEqualTo("FAILED");
        assertThat(entry.getFinishedAt()).isNotNull();
        assertThat(service.isRunning()).isFalse();
    }

    @Test
    void progressIsExposedWhileASourceRunsAndClearedAfterwards() {
        LiquiditySyncService[] holder = new LiquiditySyncService[1];
        LiquiditySyncService.Progress[] seen = new LiquiditySyncService.Progress[1];
        LiquiditySourceClient stepping = new LiquiditySourceClient() {
            @Override public LiquiditySource source() { return LiquiditySource.FRED; }
            @Override public Map<String, List<SeriesPoint>> fetch(LocalDate from, LocalDate to) { return Map.of(); }
            @Override public Map<String, List<SeriesPoint>> fetch(LocalDate from, LocalDate to, SyncProgress progress) {
                progress.onStep(3, 14, "WRESBAL");
                seen[0] = holder[0].currentProgress();
                return Map.of();
            }
        };
        holder[0] = service(stepping);

        holder[0].sync(LiquiditySyncService.Mode.INCREMENTAL);

        assertThat(seen[0].source()).isEqualTo("FRED");
        assertThat(seen[0].step()).isEqualTo(3);
        assertThat(seen[0].steps()).isEqualTo(14);
        assertThat(seen[0].label()).isEqualTo("WRESBAL");
        assertThat(holder[0].currentProgress()).isNull();
    }

    @Test
    void catchUpRebuildsEverythingWhenSomaTotalIsMissingEvenAfterARecentSuccess() throws Exception {
        LiquidityFetchLog recent = new LiquidityFetchLog();
        recent.setSource("NYFED");
        recent.setMode("INCREMENTAL");
        recent.setStartedAt(java.time.LocalDateTime.now(CLOCK));
        recent.setFinishedAt(java.time.LocalDateTime.now(CLOCK));
        recent.setStatus("SUCCESS");
        logRepo.save(recent);
        FakeClient nyfed = new FakeClient(LiquiditySource.NYFED, (f, t) -> Map.of());
        LiquiditySyncService service = service(nyfed);

        service.catchUpIfDue();
        executor.submit(() -> { }).get();
        assertThat(nyfed.calls).hasSize(1);
        assertThat(nyfed.calls.get(0)[0]).isEqualTo(HISTORY_START);

        jdbc.update("insert into liquidity_observation (series_code, obs_date, obs_value, source, fetched_at) values ('SOMA_TOTAL', ?, 6364.0, 'NYFED', now())",
                java.sql.Date.valueOf("2026-11-18"));
        service.catchUpIfDue(); // data present and the last success is recent: nothing to do
        executor.submit(() -> { }).get();
        assertThat(nyfed.calls).hasSize(1);
    }
}
