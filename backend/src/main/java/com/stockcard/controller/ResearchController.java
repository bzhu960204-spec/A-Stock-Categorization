package com.stockcard.controller;

import com.stockcard.entity.Sector;
import com.stockcard.entity.SectorReport;
import com.stockcard.service.ResearchService;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/research")
@RequiredArgsConstructor
public class ResearchController {

    private final ResearchService researchService;

    // ===== Sector APIs =====

    @GetMapping("/sectors")
    public List<Sector> getAllSectors() {
        return researchService.getAllSectors();
    }

    @PostMapping("/sectors")
    public ResponseEntity<Sector> createSector(@RequestBody Sector sector) {
        if (sector.getName() == null || sector.getName().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return researchService.createSector(sector)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(409).build());
    }

    @PutMapping("/sectors/{id}")
    public ResponseEntity<Sector> updateSector(@PathVariable Long id, @RequestBody Sector payload) {
        return researchService.updateSector(id, payload.getName())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/sectors/{id}")
    public ResponseEntity<Void> deleteSector(@PathVariable Long id) {
        return switch (researchService.deleteSector(id)) {
            case NOT_FOUND -> ResponseEntity.notFound().build();
            case HAS_REPORTS -> ResponseEntity.status(409).build();
            case DELETED -> ResponseEntity.ok().build();
        };
    }

    @PatchMapping("/sectors/{id}/archive")
    public ResponseEntity<Sector> archiveSector(@PathVariable Long id) {
        return researchService.archiveSector(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PatchMapping("/sectors/{id}/unarchive")
    public ResponseEntity<Sector> unarchiveSector(@PathVariable Long id) {
        return researchService.unarchiveSector(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // ===== SectorReport APIs =====

    @Data
    @NoArgsConstructor
    static class ReportPayload {
        private String title;
        private String content;
        private String source;
        private String reportDate;
        private String category;
        private Integer rating;
        private Long targetSectorId;
    }

    @Data
    @NoArgsConstructor
    static class RatingPayload {
        private Integer rating;
    }

    @Data
    @NoArgsConstructor
    static class MovePayload {
        private Long targetSectorId;
    }

    @Data
    static class ReportDto {
        private Long id;
        private Long sectorId;
        private String sectorName;
        private String title;
        private String content;
        private String source;
        private String reportDate;
        private String category;
        private int rating;
        private boolean archived;
        private String archivedAt;
        private String createdAt;
        private String updatedAt;

        static ReportDto from(SectorReport r) {
            ReportDto dto = new ReportDto();
            dto.id = r.getId();
            dto.sectorId = r.getSector().getId();
            dto.sectorName = r.getSector().getName();
            dto.title = r.getTitle();
            dto.content = r.getContent();
            dto.source = r.getSource();
            dto.reportDate = r.getReportDate();
            dto.category = r.getCategory();
            dto.rating = r.getRating();
            dto.archived = r.isArchived();
            dto.archivedAt = r.getArchivedAt() != null ? r.getArchivedAt().toString() : null;
            dto.createdAt = r.getCreatedAt() != null ? r.getCreatedAt().toString() : null;
            dto.updatedAt = r.getUpdatedAt() != null ? r.getUpdatedAt().toString() : null;
            return dto;
        }
    }

    @GetMapping("/sectors/{sectorId}/reports")
    public ResponseEntity<List<ReportDto>> getReports(@PathVariable Long sectorId) {
        return researchService.getReports(sectorId)
                .map(list -> ResponseEntity.ok(list.stream().map(ReportDto::from).collect(Collectors.toList())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/reports")
    public List<ReportDto> getAllReports() {
        return researchService.getAllActiveReports().stream().map(ReportDto::from).collect(Collectors.toList());
    }

    @PostMapping("/sectors/{sectorId}/reports")
    public ResponseEntity<ReportDto> createReport(@PathVariable Long sectorId, @RequestBody ReportPayload payload) {
        if (payload.getTitle() == null || payload.getTitle().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return researchService.createReport(sectorId, payload.getTitle(), payload.getContent(),
                        payload.getSource(), payload.getReportDate(), payload.getCategory(), payload.getRating())
                .map(report -> ResponseEntity.ok(ReportDto.from(report)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/sectors/{sectorId}/reports/{reportId}")
    public ResponseEntity<ReportDto> updateReport(
            @PathVariable Long sectorId,
            @PathVariable Long reportId,
            @RequestBody ReportPayload payload) {
        return researchService.updateReport(sectorId, reportId, payload.getTitle(), payload.getContent(),
                        payload.getSource(), payload.getReportDate(), payload.getCategory(), payload.getRating(),
                        payload.getTargetSectorId())
                .map(report -> ResponseEntity.ok(ReportDto.from(report)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PatchMapping("/sectors/{sectorId}/reports/{reportId}/move")
    public ResponseEntity<ReportDto> moveReport(
            @PathVariable Long sectorId,
            @PathVariable Long reportId,
            @RequestBody MovePayload payload) {
        if (payload.getTargetSectorId() == null) {
            return ResponseEntity.badRequest().build();
        }
        return researchService.moveReport(sectorId, reportId, payload.getTargetSectorId())
                .map(report -> ResponseEntity.ok(ReportDto.from(report)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PatchMapping("/sectors/{sectorId}/reports/{reportId}/rating")
    public ResponseEntity<ReportDto> updateReportRating(
            @PathVariable Long sectorId,
            @PathVariable Long reportId,
            @RequestBody RatingPayload payload) {
        if (payload.getRating() == null || payload.getRating() < 0 || payload.getRating() > 5) {
            return ResponseEntity.badRequest().build();
        }
        return researchService.updateReportRating(sectorId, reportId, payload.getRating())
                .map(report -> ResponseEntity.ok(ReportDto.from(report)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/sectors/{sectorId}/reports/{reportId}")
    public ResponseEntity<Void> deleteReport(@PathVariable Long sectorId, @PathVariable Long reportId) {
        return researchService.deleteReport(sectorId, reportId)
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
    }

    // ===== Archive =====
    @GetMapping("/reports/archived")
    public List<ReportDto> getArchivedReports() {
        return researchService.getArchivedReports().stream().map(ReportDto::from).collect(Collectors.toList());
    }

    @PatchMapping("/sectors/{sectorId}/reports/{reportId}/archive")
    public ResponseEntity<ReportDto> archiveReport(@PathVariable Long sectorId, @PathVariable Long reportId) {
        return researchService.setReportArchived(sectorId, reportId, true)
                .map(report -> ResponseEntity.ok(ReportDto.from(report)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PatchMapping("/sectors/{sectorId}/reports/{reportId}/unarchive")
    public ResponseEntity<ReportDto> unarchiveReport(@PathVariable Long sectorId, @PathVariable Long reportId) {
        return researchService.setReportArchived(sectorId, reportId, false)
                .map(report -> ResponseEntity.ok(ReportDto.from(report)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // ===== Global search across all sectors =====
    @GetMapping("/reports/search")
    public List<ReportDto> searchReports(@RequestParam String keyword) {
        String kw = keyword.trim().toLowerCase();
        if (kw.isEmpty()) return List.of();
        return researchService.searchReports(kw).stream().map(ReportDto::from).collect(Collectors.toList());
    }
}
