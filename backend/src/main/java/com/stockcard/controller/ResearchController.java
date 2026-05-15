package com.stockcard.controller;

import com.stockcard.entity.Sector;
import com.stockcard.entity.SectorReport;
import com.stockcard.repository.SectorRepository;
import com.stockcard.repository.SectorReportRepository;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/research")
@RequiredArgsConstructor
public class ResearchController {

    private final SectorRepository sectorRepository;
    private final SectorReportRepository sectorReportRepository;

    // ===== Sector APIs =====

    @GetMapping("/sectors")
    public List<Sector> getAllSectors() {
        return sectorRepository.findAll();
    }

    @PostMapping("/sectors")
    public ResponseEntity<Sector> createSector(@RequestBody Sector sector) {
        if (sector.getName() == null || sector.getName().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        if (sectorRepository.existsByName(sector.getName().trim())) {
            return ResponseEntity.status(409).build();
        }
        sector.setName(sector.getName().trim());
        return ResponseEntity.ok(sectorRepository.save(sector));
    }

    @PutMapping("/sectors/{id}")
    public ResponseEntity<Sector> updateSector(@PathVariable Long id, @RequestBody Sector payload) {
        return sectorRepository.findById(id)
                .map(sector -> {
                    if (payload.getName() != null && !payload.getName().isBlank()) {
                        sector.setName(payload.getName().trim());
                    }
                    return ResponseEntity.ok(sectorRepository.save(sector));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/sectors/{id}")
    @Transactional
    public ResponseEntity<Void> deleteSector(@PathVariable Long id) {
        if (!sectorRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        long reportCount = sectorReportRepository.countBySectorId(id);
        if (reportCount > 0) {
            return ResponseEntity.status(409).build();
        }
        sectorRepository.deleteById(id);
        return ResponseEntity.ok().build();
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
    }

    @Data
    @NoArgsConstructor
    static class RatingPayload {
        private Integer rating;
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
            dto.createdAt = r.getCreatedAt() != null ? r.getCreatedAt().toString() : null;
            dto.updatedAt = r.getUpdatedAt() != null ? r.getUpdatedAt().toString() : null;
            return dto;
        }
    }

    @GetMapping("/sectors/{sectorId}/reports")
    public ResponseEntity<List<ReportDto>> getReports(@PathVariable Long sectorId) {
        if (!sectorRepository.existsById(sectorId)) {
            return ResponseEntity.notFound().build();
        }
        List<ReportDto> dtos = sectorReportRepository.findBySectorIdOrderByCreatedAtDesc(sectorId)
                .stream().map(ReportDto::from).collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    @PostMapping("/sectors/{sectorId}/reports")
    public ResponseEntity<ReportDto> createReport(@PathVariable Long sectorId, @RequestBody ReportPayload payload) {
        if (payload.getTitle() == null || payload.getTitle().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return sectorRepository.findById(sectorId)
                .map(sector -> {
                    SectorReport report = new SectorReport();
                    report.setSector(sector);
                    report.setTitle(payload.getTitle().trim());
                    report.setContent(payload.getContent());
                    report.setSource(payload.getSource());
                    report.setReportDate(payload.getReportDate());
                    report.setCategory(payload.getCategory());
                    if (payload.getRating() != null) report.setRating(Math.max(0, Math.min(5, payload.getRating())));
                    return ResponseEntity.ok(ReportDto.from(sectorReportRepository.save(report)));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/sectors/{sectorId}/reports/{reportId}")
    public ResponseEntity<ReportDto> updateReport(
            @PathVariable Long sectorId,
            @PathVariable Long reportId,
            @RequestBody ReportPayload payload) {
        return sectorReportRepository.findById(reportId)
                .filter(r -> r.getSector().getId().equals(sectorId))
                .map(report -> {
                    if (payload.getTitle() != null && !payload.getTitle().isBlank()) {
                        report.setTitle(payload.getTitle().trim());
                    }
                    report.setContent(payload.getContent());
                    report.setSource(payload.getSource());
                    report.setReportDate(payload.getReportDate());
                    report.setCategory(payload.getCategory());
                    if (payload.getRating() != null) report.setRating(Math.max(0, Math.min(5, payload.getRating())));
                    return ResponseEntity.ok(ReportDto.from(sectorReportRepository.save(report)));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PatchMapping("/sectors/{sectorId}/reports/{reportId}/rating")
    public ResponseEntity<ReportDto> updateReportRating(
            @PathVariable Long sectorId,
            @PathVariable Long reportId,
            @RequestBody RatingPayload payload) {
        if (payload.getRating() == null || payload.getRating() < 0 || payload.getRating() > 5) {
            return ResponseEntity.badRequest().build();
        }
        return sectorReportRepository.findById(reportId)
                .filter(r -> r.getSector().getId().equals(sectorId))
                .map(report -> {
                    report.setRating(payload.getRating());
                    return ResponseEntity.ok(ReportDto.from(sectorReportRepository.save(report)));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/sectors/{sectorId}/reports/{reportId}")
    public ResponseEntity<Void> deleteReport(@PathVariable Long sectorId, @PathVariable Long reportId) {
        return sectorReportRepository.findById(reportId)
                .filter(r -> r.getSector().getId().equals(sectorId))
                .map(report -> {
                    sectorReportRepository.delete(report);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // ===== Global search across all sectors =====
    @GetMapping("/reports/search")
    public List<ReportDto> searchReports(@RequestParam String keyword) {
        String kw = keyword.trim().toLowerCase();
        if (kw.isEmpty()) return List.of();
        return sectorReportRepository.findAll().stream()
                .filter(r -> containsIgnoreCase(r.getTitle(), kw)
                          || containsIgnoreCase(r.getContent(), kw)
                          || containsIgnoreCase(r.getSource(), kw))
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .map(ReportDto::from)
                .collect(Collectors.toList());
    }

    private static boolean containsIgnoreCase(String field, String kw) {
        return field != null && field.toLowerCase().contains(kw);
    }
}
