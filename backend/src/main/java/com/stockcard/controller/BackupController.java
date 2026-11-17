package com.stockcard.controller;

import com.stockcard.service.DatabaseBackupService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/backups")
public class BackupController {

    private final DatabaseBackupService backupService;

    public BackupController(DatabaseBackupService backupService) {
        this.backupService = backupService;
    }

    @GetMapping
    public List<DatabaseBackupService.BackupInfo> list() {
        return backupService.listBackups();
    }

    /** Creates a backup immediately (used by backup-db.ps1 while the app is running). */
    @PostMapping
    public DatabaseBackupService.BackupInfo create() {
        String fileName = backupService.backupNow().getFileName().toString();
        return backupService.listBackups().stream()
                .filter(b -> b.fileName().equals(fileName))
                .findFirst()
                .orElseThrow();
    }
}
