package com.stockcard.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Online, transactionally consistent backups of the H2 file database via {@code BACKUP TO}.
 * Runs automatically when the newest backup is older than the configured interval and keeps the latest N.
 */
@Service
public class DatabaseBackupService {

    private static final Logger log = LoggerFactory.getLogger(DatabaseBackupService.class);
    private static final String PREFIX = "stockdb-";
    private static final String SUFFIX = ".zip";
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    public record BackupInfo(String fileName, long sizeBytes, Instant createdAt) {}

    private final JdbcTemplate jdbc;
    private final Path backupDir;
    private final int keep;
    private final Duration interval;
    private final boolean autoEnabled;
    private final Clock clock;

    @Autowired
    public DatabaseBackupService(JdbcTemplate jdbc,
                                 @Value("${app.backup.dir:./data/backups}") String backupDir,
                                 @Value("${app.backup.keep:14}") int keep,
                                 @Value("${app.backup.interval-hours:24}") long intervalHours,
                                 @Value("${app.backup.enabled:true}") boolean autoEnabled) {
        this(jdbc, Paths.get(backupDir), keep, Duration.ofHours(intervalHours), autoEnabled, Clock.systemDefaultZone());
    }

    DatabaseBackupService(JdbcTemplate jdbc, Path backupDir, int keep, Duration interval, boolean autoEnabled, Clock clock) {
        this.jdbc = jdbc;
        this.backupDir = backupDir.toAbsolutePath().normalize();
        this.keep = Math.max(1, keep);
        this.interval = interval;
        this.autoEnabled = autoEnabled;
        this.clock = clock;
    }

    @Scheduled(initialDelayString = "${app.backup.initial-delay-ms:60000}",
               fixedDelayString = "${app.backup.check-interval-ms:3600000}")
    public void backupIfDue() {
        if (!autoEnabled) return;
        try {
            Optional<Instant> latest = listBackups().stream().findFirst().map(BackupInfo::createdAt);
            if (latest.isEmpty() || latest.get().isBefore(clock.instant().minus(interval))) {
                Path file = backupNow();
                log.info("Automatic database backup written to {}", file);
            }
        } catch (RuntimeException e) {
            log.error("Automatic database backup failed", e);
        }
    }

    public synchronized Path backupNow() {
        try {
            Files.createDirectories(backupDir);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot create backup directory " + backupDir, e);
        }
        Path target = backupDir.resolve(PREFIX + LocalDateTime.now(clock).format(STAMP) + SUFFIX);
        // Path is generated server-side; quotes are still escaped to keep the SQL literal well-formed.
        jdbc.execute("BACKUP TO '" + target.toString().replace("'", "''") + "'");
        prune();
        return target;
    }

    /** Newest first. */
    public List<BackupInfo> listBackups() {
        if (!Files.isDirectory(backupDir)) return List.of();
        try (Stream<Path> files = Files.list(backupDir)) {
            return files
                    .filter(p -> {
                        String n = p.getFileName().toString();
                        return n.startsWith(PREFIX) && n.endsWith(SUFFIX);
                    })
                    .sorted(Comparator.comparing((Path p) -> p.getFileName().toString()).reversed())
                    .map(this::toInfo)
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private void prune() {
        List<BackupInfo> all = listBackups();
        for (BackupInfo old : all.subList(Math.min(keep, all.size()), all.size())) {
            try {
                Files.deleteIfExists(backupDir.resolve(old.fileName()));
            } catch (IOException e) {
                log.warn("Could not delete old backup {}", old.fileName(), e);
            }
        }
    }

    private BackupInfo toInfo(Path p) {
        try {
            return new BackupInfo(p.getFileName().toString(), Files.size(p), Files.getLastModifiedTime(p).toInstant());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
