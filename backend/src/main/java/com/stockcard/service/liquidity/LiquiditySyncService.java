package com.stockcard.service.liquidity;

import com.stockcard.entity.LiquidityFetchLog;
import com.stockcard.repository.LiquidityFetchLogRepository;
import com.stockcard.repository.LiquidityObservationRepository;
import com.stockcard.service.liquidity.qe.FedTextService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

/** Pulls the external sources into {@code liquidity_observation} (design §5.4) and the Fed texts into {@code fed_text_event}. One source failing never affects the others. */
@Service
public class LiquiditySyncService {

    private static final Logger log = LoggerFactory.getLogger(LiquiditySyncService.class);

    public enum Mode { INCREMENTAL, FULL }

    public record SourceStatus(String source, LocalDateTime lastSuccessAt, String lastStatus, LocalDate latestObsDate) {}

    /** What the worker is doing right now: source {@code sourceIndex}/{@code sourceCount}, step {@code step}/{@code steps} (0 when unknown). */
    public record Progress(String source, int sourceIndex, int sourceCount, int step, int steps, String label, LocalDateTime startedAt) {}

    static final String INTERRUPTED_MESSAGE = "同步被中断（应用重启或异常退出），未完成";

    private static final String MERGE_SQL = "MERGE INTO liquidity_observation "
            + "(series_code, obs_date, obs_value, source, fetched_at) KEY (series_code, obs_date) VALUES (?, ?, ?, ?, ?)";
    private static final int BATCH_SIZE = 1000;
    private static final int REVISION_LOOKBACK_DAYS = 10;
    private static final int MAX_MESSAGE = 1000;
    private static final Duration CATCH_UP_AFTER = Duration.ofHours(12);
    /** A single source that takes longer than this is aborted (checked between requests) so the sync can never hang for hours. */
    private static final Duration MAX_SOURCE_DURATION = Duration.ofMinutes(15);

    private final List<LiquiditySourceClient> clients;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final LiquidityFetchLogRepository logRepo;
    private final LiquidityObservationRepository obsRepo;
    private final FedTextService fedText;
    private final ApplicationEventPublisher events;
    private final ExecutorService executor;
    private final LocalDate historyStart;
    private final boolean enabled;
    private final Clock clock;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private volatile Progress current;

    @Autowired
    public LiquiditySyncService(List<LiquiditySourceClient> clients,
                                JdbcTemplate jdbc,
                                PlatformTransactionManager txManager,
                                LiquidityFetchLogRepository logRepo,
                                LiquidityObservationRepository obsRepo,
                                FedTextService fedText,
                                ApplicationEventPublisher events,
                                @Qualifier("liquiditySyncExecutor") ExecutorService executor,
                                @Value("${app.liquidity.history-start:2007-01-01}") String historyStart,
                                @Value("${app.liquidity.enabled:true}") boolean enabled) {
        this(clients, jdbc, txManager, logRepo, obsRepo, fedText, events, executor, LocalDate.parse(historyStart), enabled, Clock.systemDefaultZone());
    }

    LiquiditySyncService(List<LiquiditySourceClient> clients, JdbcTemplate jdbc, PlatformTransactionManager txManager,
                         LiquidityFetchLogRepository logRepo, LiquidityObservationRepository obsRepo,
                         FedTextService fedText, ApplicationEventPublisher events,
                         ExecutorService executor, LocalDate historyStart, boolean enabled, Clock clock) {
        this.clients = clients.stream().sorted(Comparator.comparing(LiquiditySourceClient::source)).toList();
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(txManager);
        this.logRepo = logRepo;
        this.obsRepo = obsRepo;
        this.fedText = fedText;
        this.events = events;
        this.executor = executor;
        this.historyStart = historyStart;
        this.enabled = enabled;
        this.clock = clock;
    }

    public boolean isRunning() {
        return running.get();
    }

    /** The step currently being worked on, or null when idle. */
    public Progress currentProgress() {
        return running.get() ? current : null;
    }

    /**
     * A run that was killed mid-way (restart, crash) leaves its fetch-log row in RUNNING forever; the in-memory lock does not
     * survive a restart, so at start-up no RUNNING row can still be alive. Mark them failed so the UI does not show them as running.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void recoverInterruptedRuns() {
        if (running.get()) return;
        try {
            List<LiquidityFetchLog> stale = logRepo.findByStatus("RUNNING");
            LocalDateTime now = LocalDateTime.now(clock);
            for (LiquidityFetchLog entry : stale) {
                entry.setStatus("FAILED");
                entry.setFinishedAt(now);
                entry.setMessage(INTERRUPTED_MESSAGE);
            }
            logRepo.saveAll(stale);
            if (!stale.isEmpty()) log.warn("Marked {} interrupted liquidity sync run(s) as FAILED", stale.size());
        } catch (RuntimeException e) {
            log.warn("Could not recover interrupted liquidity sync runs: {}", abbreviate(e.getMessage()));
        }
    }

    /** Starts a sync on the background worker and returns immediately; 409 if one is already running. */
    public void triggerAsync(Mode mode) {
        triggerAsync(mode, null);
    }

    /** As {@link #triggerAsync(Mode)}, restricted to one source when {@code source} is non-null; 400 if that source cannot be synced. */
    public void triggerAsync(Mode mode, LiquiditySource source) {
        List<LiquiditySourceClient> selected = select(source);
        boolean withText = includesFedText(source);
        acquire();
        try {
            executor.execute(() -> runAndRelease(mode, selected, withText));
        } catch (RuntimeException e) {
            running.set(false);
            throw e;
        }
    }

    /** Runs a sync on the calling thread; 409 if one is already running. */
    public void sync(Mode mode) {
        sync(mode, null);
    }

    public void sync(Mode mode, LiquiditySource source) {
        List<LiquiditySourceClient> selected = select(source);
        boolean withText = includesFedText(source);
        acquire();
        runAndRelease(mode, selected, withText);
    }

    private List<LiquiditySourceClient> select(LiquiditySource source) {
        if (source == null) return clients;
        if (source == LiquiditySource.FEDTEXT) return List.of();
        List<LiquiditySourceClient> selected = clients.stream().filter(c -> c.source() == source).toList();
        if (selected.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "该数据源不支持同步：" + source);
        }
        return selected;
    }

    /** The Fed text source has no client; it runs after the numeric sources, or alone for {@code ?source=FEDTEXT}. */
    private static boolean includesFedText(LiquiditySource source) {
        return source == null || source == LiquiditySource.FEDTEXT;
    }

    public List<LiquidityFetchLog> recentLogs() {
        return logRepo.findTop20ByOrderByIdDesc();
    }

    public List<SourceStatus> sourceStatuses() {
        List<SourceStatus> out = new ArrayList<>(clients.stream().map(c -> statusOf(c.source().name(), obsRepo.maxObsDateBySource(c.source().name()))).toList());
        out.add(statusOf(LiquiditySource.FEDTEXT.name(), fedText.latestDocDate()));
        return out;
    }

    private SourceStatus statusOf(String source, LocalDate latest) {
        LocalDateTime lastSuccess = logRepo.findFirstBySourceAndStatusOrderByIdDesc(source, "SUCCESS")
                .map(LiquidityFetchLog::getFinishedAt).orElse(null);
        String lastStatus = logRepo.findFirstBySourceOrderByIdDesc(source).map(LiquidityFetchLog::getStatus).orElse(null);
        return new SourceStatus(source, lastSuccess, lastStatus, latest);
    }

    // ---- triggers ----

    @Scheduled(cron = "${app.liquidity.cron:0 30 9,22 * * *}", zone = "Asia/Shanghai")
    public void scheduledSync() {
        if (!enabled) return;
        startQuietly(Mode.INCREMENTAL);
    }

    /**
     * Runs shortly after start-up and then hourly: syncs if the last success is older than 12h. FULL when nothing is stored yet,
     * and also when SOMA_TOTAL is missing (a database from before the QE radar has no 2007-2018 history and no SOMA data).
     */
    @Scheduled(initialDelayString = "${app.liquidity.catch-up-initial-delay-ms:120000}",
               fixedDelayString = "${app.liquidity.catch-up-interval-ms:3600000}")
    public void catchUpIfDue() {
        if (!enabled) return;
        Optional<LocalDateTime> lastSuccess = logRepo.findFirstByStatusOrderByIdDesc("SUCCESS").map(LiquidityFetchLog::getFinishedAt);
        boolean stale = lastSuccess.isEmpty() || lastSuccess.get().isBefore(LocalDateTime.now(clock).minus(CATCH_UP_AFTER));
        boolean needsBackfill = !obsRepo.existsBySeriesCode("SOMA_TOTAL");
        if (stale || needsBackfill) startQuietly(needsBackfill ? Mode.FULL : Mode.INCREMENTAL);
    }

    private void startQuietly(Mode mode) {
        try {
            triggerAsync(mode);
        } catch (ResponseStatusException e) {
            log.info("Liquidity sync skipped: {}", e.getReason());
        } catch (RuntimeException e) {
            log.error("Could not start liquidity sync", e);
        }
    }

    // ---- sync ----

    private void acquire() {
        if (!running.compareAndSet(false, true)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "同步进行中");
        }
    }

    private void runAndRelease(Mode mode, List<LiquiditySourceClient> selected, boolean withFedText) {
        int total = selected.size() + (withFedText ? 1 : 0);
        int index = 0;
        log.info("Liquidity sync started: mode={}, sources={}", mode, total);
        try {
            LocalDate to = LocalDate.now(clock);
            for (LiquiditySourceClient client : selected) {
                syncSource(client, mode, to, ++index, total);
            }
            if (withFedText) {
                runLogged(LiquiditySource.FEDTEXT.name(), null, to, mode, ++index, total, progress -> fedText.sync(mode == Mode.FULL));
            }
        } finally {
            current = null;
            running.set(false);
            log.info("Liquidity sync finished: mode={}", mode);
            publishFinished(mode);
        }
    }

    /** Listeners run on the sync thread after the lock is released; whatever they do must not turn into a sync failure. */
    private void publishFinished(Mode mode) {
        try {
            events.publishEvent(new LiquiditySyncFinishedEvent(mode));
        } catch (RuntimeException e) {
            log.warn("A liquidity sync listener failed: {}", abbreviate(e.getMessage()));
        }
    }

    private void syncSource(LiquiditySourceClient client, Mode mode, LocalDate to, int index, int total) {
        String source = client.source().name();
        LocalDate from = resolveFrom(client.source(), mode);
        runLogged(source, from, to, mode, index, total, progress -> {
            Map<String, List<SeriesPoint>> points = client.fetch(from, to, progress);
            return tx.execute(status -> upsert(points, source));
        });
    }

    /** One source's work; it reports steps through {@code progress}, which aborts the work once the source's deadline has passed. */
    @FunctionalInterface
    private interface Work {
        Integer run(LiquiditySourceClient.SyncProgress progress) throws Exception;
    }

    /** Wraps one source's work in a fetch-log entry; {@code work} returns the number of rows (or documents) written. */
    private void runLogged(String source, LocalDate from, LocalDate to, Mode mode, int index, int total, Work work) {
        LiquidityFetchLog entry = new LiquidityFetchLog();
        entry.setSource(source);
        entry.setMode(mode.name());
        entry.setRangeFrom(from);
        entry.setRangeTo(to);
        LocalDateTime started = LocalDateTime.now(clock);
        entry.setStartedAt(started);
        entry.setStatus("RUNNING");
        entry = logRepo.save(entry);
        current = new Progress(source, index, total, 0, 0, null, started);
        log.info("Liquidity sync of {} started ({}/{}): {} ~ {}", source, index, total, from, to);

        LiquiditySourceClient.SyncProgress progress = (step, steps, label) -> {
            if (Duration.between(started, LocalDateTime.now(clock)).compareTo(MAX_SOURCE_DURATION) > 0) {
                throw new IllegalStateException("同步超时（超过 " + MAX_SOURCE_DURATION.toMinutes() + " 分钟），已中止");
            }
            current = new Progress(source, index, total, step, steps, label, started);
            log.debug("Liquidity sync of {}: {}/{} {}", source, step, steps, label);
        };

        try {
            Integer rows = work.run(progress);
            finish(entry, "SUCCESS", rows == null ? 0 : rows, null);
            log.info("Liquidity sync of {} succeeded: {} rows in {}s", source, rows, Duration.between(started, LocalDateTime.now(clock)).toSeconds());
        } catch (MissingApiKeyException e) {
            finish(entry, "SKIPPED", 0, e.getMessage());
            log.info("Liquidity sync of {} skipped: {}", source, e.getMessage());
        } catch (Exception e) {
            log.warn("Liquidity sync of {} failed: {}", source, abbreviate(LiquidityHttp.redact(e.getMessage())));
            finish(entry, "FAILED", 0, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        } catch (Error e) {
            // OutOfMemoryError and friends: record the failure so the row does not stay RUNNING, then let the error propagate.
            log.error("Liquidity sync of {} aborted by an error", source, e);
            finish(entry, "FAILED", 0, e.getClass().getSimpleName() + (e.getMessage() == null ? "" : ": " + e.getMessage()));
            throw e;
        }
    }

    private LocalDate resolveFrom(LiquiditySource source, Mode mode) {
        if (mode == Mode.FULL) return historyStart;
        LocalDate latest = obsRepo.maxObsDateBySource(source.name());
        if (latest == null) return historyStart;
        LocalDate from = latest.minusDays(REVISION_LOOKBACK_DAYS);
        return from.isBefore(historyStart) ? historyStart : from;
    }

    private static String abbreviate(String text) {
        return text == null || text.length() <= 300 ? text : text.substring(0, 300) + "…";
    }

    private void finish(LiquidityFetchLog entry, String status, int rows, String message) {
        entry.setStatus(status);
        entry.setRowsUpserted(rows);
        entry.setFinishedAt(LocalDateTime.now(clock));
        if (message != null) {
            String safe = LiquidityHttp.redact(message);
            entry.setMessage(safe.length() > MAX_MESSAGE ? safe.substring(0, MAX_MESSAGE) : safe);
        }
        logRepo.save(entry);
    }

    private int upsert(Map<String, List<SeriesPoint>> points, String source) {
        Timestamp now = Timestamp.valueOf(LocalDateTime.now(clock));
        List<Object[]> rows = points.entrySet().stream()
                .flatMap(e -> e.getValue().stream()
                        .map(p -> new Object[]{e.getKey(), Date.valueOf(p.date()), p.value(), source, now}))
                .toList();
        jdbc.batchUpdate(MERGE_SQL, rows, BATCH_SIZE, (ps, row) -> {
            for (int i = 0; i < row.length; i++) ps.setObject(i + 1, row[i]);
        });
        return rows.size();
    }
}
