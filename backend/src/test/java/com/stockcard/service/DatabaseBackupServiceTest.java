package com.stockcard.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.zip.ZipFile;

import static org.assertj.core.api.Assertions.assertThat;

class DatabaseBackupServiceTest {

    @TempDir Path tmp;

    private JdbcTemplate fileDb() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                "jdbc:h2:file:" + tmp.resolve("db/stockdb").toAbsolutePath() + ";DB_CLOSE_DELAY=-1", "sa", "");
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.execute("CREATE TABLE IF NOT EXISTS t(id INT)");
        jdbc.execute("INSERT INTO t VALUES (1)");
        return jdbc;
    }

    /** A clock that advances one second per call so every backup gets a distinct file name. */
    private static Clock tickingClock() {
        Instant start = Instant.parse("2026-01-01T00:00:00Z");
        return new Clock() {
            private int ticks;
            @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return start.plusSeconds(ticks++); }
        };
    }

    @Test
    void backupNowWritesZipContainingTheDatabase() throws Exception {
        DatabaseBackupService service = new DatabaseBackupService(
                fileDb(), tmp.resolve("backups"), 5, Duration.ofHours(24), true, tickingClock());

        Path zip = service.backupNow();

        assertThat(zip).exists();
        try (ZipFile zf = new ZipFile(zip.toFile())) {
            assertThat(zf.stream().map(e -> e.getName())).anyMatch(n -> n.endsWith(".mv.db"));
        }
        assertThat(service.listBackups()).hasSize(1);
    }

    @Test
    void keepsOnlyTheNewestBackups() {
        DatabaseBackupService service = new DatabaseBackupService(
                fileDb(), tmp.resolve("backups"), 2, Duration.ofHours(24), true, tickingClock());

        service.backupNow();
        Path second = service.backupNow();
        Path third = service.backupNow();

        List<String> names = service.listBackups().stream().map(DatabaseBackupService.BackupInfo::fileName).toList();
        assertThat(names).containsExactly(third.getFileName().toString(), second.getFileName().toString());
    }

    @Test
    void autoBackupRunsWhenNoneExistsAndSkipsWhenRecent() throws Exception {
        Path dir = tmp.resolve("backups");
        DatabaseBackupService service = new DatabaseBackupService(
                fileDb(), dir, 5, Duration.ofHours(24), true, Clock.systemDefaultZone());

        service.backupIfDue();
        assertThat(service.listBackups()).hasSize(1);

        service.backupIfDue(); // newest backup is fresh -> nothing new
        assertThat(service.listBackups()).hasSize(1);
        try (var files = Files.list(dir)) {
            assertThat(files.count()).isEqualTo(1);
        }
    }

    @Test
    void autoBackupDisabledDoesNothing() {
        DatabaseBackupService service = new DatabaseBackupService(
                fileDb(), tmp.resolve("backups"), 5, Duration.ofHours(24), false, Clock.systemDefaultZone());

        service.backupIfDue();

        assertThat(service.listBackups()).isEmpty();
    }
}
