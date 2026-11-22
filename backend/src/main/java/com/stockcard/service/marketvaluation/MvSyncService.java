package com.stockcard.service.marketvaluation;

import com.stockcard.entity.MvFactsetReport;
import com.stockcard.entity.MvFetchLog;
import com.stockcard.repository.MvFactsetReportRepository;
import com.stockcard.repository.MvFetchLogRepository;
import com.stockcard.repository.MvObservationRepository;
import com.stockcard.service.liquidity.MissingApiKeyException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
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
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Pulls the external sources into {@code mv_observation} (design §5.4). One source failing never affects the others;
 * FactSet is processed week by week against the {@code mv_factset_report} bookkeeping.
 */
@Service
public class MvSyncService {

    private static final Logger log = LoggerFactory.getLogger(MvSyncService.class);

    public record SourceStatus(String source, LocalDateTime lastSuccessAt, String lastStatus, LocalDate latestObsDate) {}

    /** What the worker is doing right now: source {@code sourceIndex}/{@code sourceCount}, step {@code step}/{@code steps} (0 when unknown). */
    public record Progress(String source, int sourceIndex, int sourceCount, int step, int steps, String label, LocalDateTime startedAt) {}

    public record RefreshResult(boolean triggered, LocalDateTime lastSuccessAt) {}

    /** One source's result: rows written, parts that failed (=> PARTIAL) and an informational message. */
    private record Outcome(int rows, List<String> warnings, String info) {}

    static final String INTERRUPTED_MESSAGE = "同步被中断（应用重启或异常退出），未完成";

    private static final String MERGE_SQL = "MERGE INTO mv_observation "
            + "(series_code, obs_date, obs_value, source, estimate, fetched_at) KEY (series_code, obs_date) VALUES (?, ?, ?, ?, ?, ?)";
    private static final int BATCH_SIZE = 1000;
    private static final int DAILY_LOOKBACK_DAYS = 10;
    private static final int SLOW_LOOKBACK_YEARS = 2;
    private static final int MAX_MESSAGE = 1000;
    private static final Duration CATCH_UP_AFTER = Duration.ofHours(12);
    private static final Duration MAX_SOURCE_DURATION = Duration.ofMinutes(15);
    private static final LocalDate FRED_HISTORY_START = LocalDate.of(1945, 1, 1);
    private static final int RECENT_FACTSET_WEEKS = 8;
    private static final int NOT_FOUND_RETRY_WEEKS = 3;
    private static final List<String> SUCCESS_STATUSES = List.of("SUCCESS", "PARTIAL");
    /** FactSet last: it is the slowest and its history back-fills over several runs. */
    private static final List<MvSource> ORDER = List.of(MvSource.YAHOO, MvSource.MULTPL, MvSource.WPR, MvSource.FRED, MvSource.FACTSET);

    private final List<MvSourceClient> clients;
    private final FactsetClient factset;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final MvFetchLogRepository logRepo;
    private final MvObservationRepository obsRepo;
    private final MvFactsetReportRepository factsetRepo;
    private final ExecutorService executor;
    private final LocalDate priceHistoryStart;
    private final LocalDate factsetHistoryStart;
    private final int factsetMaxPerRun;
    private final Duration staleAfter;
    private final boolean enabled;
    private final Clock clock;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private volatile Progress current;

    @Autowired
    public MvSyncService(List<MvSourceClient> clients,
                         FactsetClient factset,
                         JdbcTemplate jdbc,
                         PlatformTransactionManager txManager,
                         MvFetchLogRepository logRepo,
                         MvObservationRepository obsRepo,
                         MvFactsetReportRepository factsetRepo,
                         @Qualifier("marketValuationSyncExecutor") ExecutorService executor,
                         @Value("${app.market-valuation.price-history-start:1990-01-01}") String priceHistoryStart,
                         @Value("${app.market-valuation.factset-history-start:2017-01-06}") String factsetHistoryStart,
                         @Value("${app.market-valuation.factset-max-per-run:60}") int factsetMaxPerRun,
                         @Value("${app.market-valuation.stale-after:6h}") Duration staleAfter,
                         @Value("${app.market-valuation.enabled:true}") boolean enabled) {
        this(clients, factset, jdbc, txManager, logRepo, obsRepo, factsetRepo, executor, LocalDate.parse(priceHistoryStart),
                LocalDate.parse(factsetHistoryStart), factsetMaxPerRun, staleAfter, enabled, Clock.system(ZoneId.of("Asia/Shanghai")));
    }

    MvSyncService(List<MvSourceClient> clients, FactsetClient factset, JdbcTemplate jdbc, PlatformTransactionManager txManager,
                  MvFetchLogRepository logRepo, MvObservationRepository obsRepo, MvFactsetReportRepository factsetRepo,
                  ExecutorService executor, LocalDate priceHistoryStart, LocalDate factsetHistoryStart, int factsetMaxPerRun,
                  Duration staleAfter, boolean enabled, Clock clock) {
        this.clients = clients.stream().sorted(Comparator.comparingInt(c -> ORDER.indexOf(c.source()))).toList();
        this.factset = factset;
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(txManager);
        this.logRepo = logRepo;
        this.obsRepo = obsRepo;
        this.factsetRepo = factsetRepo;
        this.executor = executor;
        this.priceHistoryStart = priceHistoryStart;
        this.factsetHistoryStart = factsetHistoryStart;
        this.factsetMaxPerRun = factsetMaxPerRun;
        this.staleAfter = staleAfter;
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
            List<MvFetchLog> stale = logRepo.findByStatus("RUNNING");
            LocalDateTime now = LocalDateTime.now(clock);
            for (MvFetchLog entry : stale) {
                entry.setStatus("FAILED");
                entry.setFinishedAt(now);
                entry.setMessage(INTERRUPTED_MESSAGE);
            }
            logRepo.saveAll(stale);
            if (!stale.isEmpty()) log.warn("Marked {} interrupted market valuation sync run(s) as FAILED", stale.size());
        } catch (RuntimeException e) {
            log.warn("Could not recover interrupted market valuation sync runs: {}", abbreviate(e.getMessage()));
        }
    }

    // ---- entry points ----

    /** Starts a sync on the background worker and returns immediately; 409 if one is already running. */
    public void triggerAsync(FetchMode mode, MvSource source) {
        List<MvSource> sources = select(source);
        acquire();
        submit(mode, sources, null);
    }

    /** Runs a sync on the calling thread; 409 if one is already running. */
    public void sync(FetchMode mode, MvSource source) {
        List<MvSource> sources = select(source);
        acquire();
        runAndRelease(mode, sources, null);
    }

    /** Forgets the bookkeeping of one FactSet week and processes just that week again. */
    public void retryFactsetWeek(LocalDate weekFriday) {
        if (weekFriday.getDayOfWeek() != DayOfWeek.FRIDAY) throw new IllegalArgumentException("weekFriday 必须是周五");
        if (weekFriday.isAfter(LocalDate.now(clock))) throw new IllegalArgumentException("weekFriday 不能晚于今天");
        acquire();
        try {
            factsetRepo.deleteById(weekFriday);
        } catch (RuntimeException e) {
            running.set(false);
            throw e;
        }
        submit(FetchMode.INCREMENTAL, List.of(MvSource.FACTSET), List.of(weekFriday));
    }

    private void submit(FetchMode mode, List<MvSource> sources, List<LocalDate> forcedWeeks) {
        try {
            executor.execute(() -> runAndRelease(mode, sources, forcedWeeks));
        } catch (RuntimeException e) {
            running.set(false);
            throw e;
        }
    }

    private List<MvSource> select(MvSource source) {
        if (source == null) return ORDER.stream().filter(this::available).toList();
        if (!available(source)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "该数据源不支持同步：" + source);
        return List.of(source);
    }

    private boolean available(MvSource source) {
        return source == MvSource.FACTSET || clients.stream().anyMatch(c -> c.source() == source);
    }

    public List<MvFetchLog> recentLogs() {
        return logRepo.findTop20ByOrderByIdDesc();
    }

    public List<SourceStatus> sourceStatuses() {
        return ORDER.stream().filter(this::available).map(s -> {
            LocalDateTime lastSuccess = logRepo.findFirstBySourceAndStatusInOrderByIdDesc(s.name(), SUCCESS_STATUSES)
                    .map(MvFetchLog::getFinishedAt).orElse(null);
            String lastStatus = logRepo.findFirstBySourceOrderByIdDesc(s.name()).map(MvFetchLog::getStatus).orElse(null);
            return new SourceStatus(s.name(), lastSuccess, lastStatus, obsRepo.maxObsDateBySource(s.name()));
        }).toList();
    }

    public Optional<LocalDateTime> lastSuccessAt() {
        return logRepo.findFirstByStatusInOrderByIdDesc(SUCCESS_STATUSES).map(MvFetchLog::getFinishedAt);
    }

    /** Opening the page: sync now only when the last success is older than {@code stale-after} and nothing is running. */
    public RefreshResult refreshIfStale() {
        LocalDateTime last = lastSuccessAt().orElse(null);
        if (running.get()) return new RefreshResult(false, last);
        boolean stale = last == null || last.isBefore(LocalDateTime.now(clock).minus(staleAfter));
        if (!stale) return new RefreshResult(false, last);
        try {
            triggerAsync(obsRepo.count() == 0 ? FetchMode.FULL : FetchMode.INCREMENTAL, null);
            return new RefreshResult(true, last);
        } catch (ResponseStatusException e) {
            return new RefreshResult(false, last);
        }
    }

    public Map<String, Integer> factsetProgress() {
        List<LocalDate> all = FactsetClient.fridaysBetween(factsetHistoryStart, LocalDate.now(clock));
        Map<LocalDate, MvFactsetReport> booked = bookedWeeks();
        int processed = (int) all.stream().filter(booked::containsKey).count();
        return Map.of("processedWeeks", processed, "totalWeeks", all.size());
    }

    // ---- triggers ----

    @Scheduled(cron = "${app.market-valuation.cron:0 30 6 * * *}", zone = "Asia/Shanghai")
    public void scheduledSync() {
        if (!enabled) return;
        startQuietly(FetchMode.INCREMENTAL, null);
    }

    /**
     * Runs shortly after start-up and then hourly: FULL when nothing is stored, an incremental sync when the last success is older
     * than 12h, and otherwise (only) the next batch of FactSet history while that back-fill is unfinished.
     */
    @Scheduled(initialDelayString = "${app.market-valuation.catch-up-initial-delay-ms:120000}",
               fixedDelayString = "${app.market-valuation.catch-up-interval-ms:3600000}")
    public void catchUpIfDue() {
        if (!enabled) return;
        if (obsRepo.count() == 0) {
            startQuietly(FetchMode.FULL, null);
            return;
        }
        LocalDateTime last = lastSuccessAt().orElse(null);
        if (last == null || last.isBefore(LocalDateTime.now(clock).minus(CATCH_UP_AFTER))) {
            startQuietly(FetchMode.INCREMENTAL, null);
        } else if (factsetBackfillIncomplete()) {
            startQuietly(FetchMode.INCREMENTAL, MvSource.FACTSET);
        }
    }

    boolean factsetBackfillIncomplete() {
        Map<LocalDate, MvFactsetReport> booked = bookedWeeks();
        return FactsetClient.fridaysBetween(factsetHistoryStart, LocalDate.now(clock)).stream().anyMatch(w -> !booked.containsKey(w));
    }

    private void startQuietly(FetchMode mode, MvSource source) {
        try {
            triggerAsync(mode, source);
        } catch (ResponseStatusException e) {
            log.info("Market valuation sync skipped: {}", e.getReason());
        } catch (RuntimeException e) {
            log.error("Could not start market valuation sync", e);
        }
    }

    // ---- sync ----

    private void acquire() {
        if (!running.compareAndSet(false, true)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "同步进行中");
        }
    }

    private void runAndRelease(FetchMode mode, List<MvSource> sources, List<LocalDate> forcedWeeks) {
        int total = sources.size();
        int index = 0;
        log.info("Market valuation sync started: mode={}, sources={}", mode, sources);
        try {
            LocalDate to = LocalDate.now(clock);
            for (MvSource source : sources) {
                index++;
                if (source == MvSource.FACTSET) {
                    syncFactset(mode, to, index, total, forcedWeeks);
                } else {
                    syncClient(clients.stream().filter(c -> c.source() == source).findFirst().orElseThrow(), mode, to, index, total);
                }
            }
        } finally {
            current = null;
            running.set(false);
            log.info("Market valuation sync finished: mode={}", mode);
        }
    }

    private void syncClient(MvSourceClient client, FetchMode mode, LocalDate to, int index, int total) {
        String source = client.source().name();
        LocalDate from = resolveFrom(client.source(), mode);
        runLogged(source, from, to, mode, index, total, progress -> {
            MvFetchResult result = client.fetchDetailed(from, to, mode, progress);
            int rows = tx.execute(status -> upsert(result.points(), source));
            return new Outcome(rows, result.warnings(), null);
        });
    }

    private void syncFactset(FetchMode mode, LocalDate to, int index, int total, List<LocalDate> forcedWeeks) {
        List<LocalDate> weeks = forcedWeeks != null ? forcedWeeks : planFactsetWeeks(mode, to);
        runLogged(MvSource.FACTSET.name(), factsetHistoryStart, to, mode, index, total, progress -> {
            if (weeks.isEmpty()) return new Outcome(0, List.of(), "没有待处理的周");
            int[] counts = new int[4]; // rows, parsed, not found, parse failed
            factset.fetchWeeks(weeks, progress, result -> counts[0] += tx.execute(status -> storeWeek(result, counts)));
            List<String> warnings = counts[3] > 0 ? List.of(counts[3] + " 周解析失败（可在设置页重试）") : List.of();
            return new Outcome(counts[0], warnings, "处理 " + weeks.size() + " 周：解析 " + counts[1] + "，未找到 " + counts[2] + "，失败 " + counts[3]);
        });
    }

    /** Writes one week's observations and its bookkeeping row; returns the observation rows written. */
    private int storeWeek(FactsetClient.WeekResult result, int[] counts) {
        int rows = 0;
        switch (result.status()) {
            case "PARSED" -> {
                counts[1]++;
                Map<String, List<MvPoint>> points = new LinkedHashMap<>();
                result.values().forEach((code, value) -> points.put(code, List.of(new MvPoint(result.reportDate(), value, false))));
                rows = upsert(points, MvSource.FACTSET.name());
            }
            case "NOT_FOUND" -> counts[2]++;
            default -> counts[3]++;
        }
        MvFactsetReport row = new MvFactsetReport();
        row.setWeekFriday(result.weekFriday());
        row.setReportDate(result.reportDate());
        row.setFileName(result.fileName());
        row.setStatus(result.status());
        row.setFiscalQuarter(result.fiscalQuarter());
        row.setMessage(result.message() == null ? null : abbreviate(result.message(), MAX_MESSAGE));
        row.setFetchedAt(LocalDateTime.now(clock));
        factsetRepo.save(row);
        return rows;
    }

    /**
     * The weeks FactSet should be asked for, newest first and at most {@code factset-max-per-run}. FULL: every unrecorded week plus
     * the failed ones. INCREMENTAL: the last 8 weeks without a PARSED report (a NOT_FOUND week is only retried within 3 weeks)
     * followed by older unrecorded weeks.
     */
    List<LocalDate> planFactsetWeeks(FetchMode mode, LocalDate today) {
        List<LocalDate> all = FactsetClient.fridaysBetween(factsetHistoryStart, today);
        Map<LocalDate, MvFactsetReport> booked = bookedWeeks();
        List<LocalDate> plan = new ArrayList<>();
        if (mode == FetchMode.FULL) {
            for (LocalDate w : all) {
                MvFactsetReport b = booked.get(w);
                if (b == null || "PARSE_FAILED".equals(b.getStatus())) plan.add(w);
            }
        } else {
            LocalDate recentFrom = today.minusWeeks(RECENT_FACTSET_WEEKS);
            LocalDate notFoundFrom = today.minusWeeks(NOT_FOUND_RETRY_WEEKS);
            List<LocalDate> older = new ArrayList<>();
            for (LocalDate w : all) {
                MvFactsetReport b = booked.get(w);
                if (w.isBefore(recentFrom)) {
                    if (b == null) older.add(w);
                } else if (b == null || "PARSE_FAILED".equals(b.getStatus())
                        || ("NOT_FOUND".equals(b.getStatus()) && !w.isBefore(notFoundFrom))) {
                    plan.add(w);
                }
            }
            plan.addAll(older);
        }
        return plan.size() > factsetMaxPerRun ? new ArrayList<>(plan.subList(0, factsetMaxPerRun)) : plan;
    }

    private Map<LocalDate, MvFactsetReport> bookedWeeks() {
        Map<LocalDate, MvFactsetReport> map = new HashMap<>();
        factsetRepo.findAll().forEach(r -> map.put(r.getWeekFriday(), r));
        return map;
    }

    @FunctionalInterface
    private interface Work {
        Outcome run(MvSourceClient.SyncProgress progress) throws Exception;
    }

    /** Wraps one source's work in a fetch-log entry; the progress sink aborts the work once the source's deadline has passed. */
    private void runLogged(String source, LocalDate from, LocalDate to, FetchMode mode, int index, int total, Work work) {
        MvFetchLog entry = new MvFetchLog();
        entry.setSource(source);
        entry.setMode(mode.name());
        entry.setRangeFrom(from);
        entry.setRangeTo(to);
        LocalDateTime started = LocalDateTime.now(clock);
        entry.setStartedAt(started);
        entry.setStatus("RUNNING");
        entry = logRepo.save(entry);
        current = new Progress(source, index, total, 0, 0, null, started);
        log.info("Market valuation sync of {} started ({}/{}): {} ~ {}", source, index, total, from, to);

        MvSourceClient.SyncProgress progress = (step, steps, label) -> {
            if (Duration.between(started, LocalDateTime.now(clock)).compareTo(MAX_SOURCE_DURATION) > 0) {
                throw new IllegalStateException("同步超时（超过 " + MAX_SOURCE_DURATION.toMinutes() + " 分钟），已中止");
            }
            current = new Progress(source, index, total, step, steps, label, started);
        };

        try {
            Outcome outcome = work.run(progress);
            boolean partial = !outcome.warnings().isEmpty();
            String message = partial ? String.join("；", outcome.warnings()) : outcome.info();
            finish(entry, partial ? "PARTIAL" : "SUCCESS", outcome.rows(), message);
            log.info("Market valuation sync of {} {}: {} rows in {}s", source, partial ? "partial" : "succeeded", outcome.rows(),
                    Duration.between(started, LocalDateTime.now(clock)).toSeconds());
        } catch (MissingApiKeyException e) {
            finish(entry, "SKIPPED", 0, e.getMessage());
            log.info("Market valuation sync of {} skipped: {}", source, e.getMessage());
        } catch (Exception e) {
            log.warn("Market valuation sync of {} failed: {}", source, abbreviate(MvHttp.redact(e.getMessage()), 300));
            finish(entry, "FAILED", 0, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        } catch (Error e) {
            // OutOfMemoryError and friends: record the failure so the row does not stay RUNNING, then let the error propagate.
            log.error("Market valuation sync of {} aborted by an error", source, e);
            finish(entry, "FAILED", 0, e.getClass().getSimpleName() + (e.getMessage() == null ? "" : ": " + e.getMessage()));
            throw e;
        }
    }

    /**
     * Where a source's fetch starts: FULL = its history start; INCREMENTAL = the oldest "latest stored date minus a look-back"
     * over the series it feeds (10 days for daily data, 2 years for the slow, revisable FRED series).
     */
    LocalDate resolveFrom(MvSource source, FetchMode mode) {
        LocalDate start = source == MvSource.FRED ? FRED_HISTORY_START : priceHistoryStart;
        if (mode == FetchMode.FULL) return start;
        LocalDate from = null;
        for (MvSeries s : MvSeries.rawOf(source)) {
            LocalDate latest = obsRepo.maxObsDate(s.code());
            LocalDate candidate = latest == null ? start
                    : s.frequency() == MvSeries.Frequency.DAILY ? latest.minusDays(DAILY_LOOKBACK_DAYS) : latest.minusYears(SLOW_LOOKBACK_YEARS);
            if (from == null || candidate.isBefore(from)) from = candidate;
        }
        if (from == null || from.isBefore(start)) return start;
        return from;
    }

    private static String abbreviate(String text, int max) {
        return text == null || text.length() <= max ? text : text.substring(0, max) + "…";
    }

    private static String abbreviate(String text) {
        return abbreviate(text, 300);
    }

    private void finish(MvFetchLog entry, String status, int rows, String message) {
        entry.setStatus(status);
        entry.setRowsUpserted(rows);
        entry.setFinishedAt(LocalDateTime.now(clock));
        if (message != null) {
            String safe = MvHttp.redact(message);
            entry.setMessage(safe.length() > MAX_MESSAGE ? safe.substring(0, MAX_MESSAGE) : safe);
        }
        logRepo.save(entry);
    }

    private int upsert(Map<String, List<MvPoint>> points, String source) {
        Timestamp now = Timestamp.valueOf(LocalDateTime.now(clock));
        List<Object[]> rows = points.entrySet().stream()
                .flatMap(e -> e.getValue().stream()
                        .filter(p -> p.date() != null && Double.isFinite(p.value()))
                        .map(p -> new Object[]{e.getKey(), Date.valueOf(p.date()), p.value(), source, p.estimate(), now}))
                .toList();
        jdbc.batchUpdate(MERGE_SQL, rows, BATCH_SIZE, (ps, row) -> {
            for (int i = 0; i < row.length; i++) ps.setObject(i + 1, row[i]);
        });
        return rows.size();
    }
}
