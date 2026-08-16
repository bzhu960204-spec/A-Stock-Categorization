package com.stockcard.service;

import com.stockcard.entity.Sector;
import com.stockcard.entity.SectorReport;
import com.stockcard.repository.SectorRepository;
import com.stockcard.repository.SectorReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ResearchService {

    private final SectorRepository sectorRepository;
    private final SectorReportRepository sectorReportRepository;

    public enum SectorDeleteResult { NOT_FOUND, HAS_REPORTS, DELETED }

    // ── Sectors ───────────────────────────────────────────────────────────────

    public List<Sector> getAllSectors() {
        return sectorRepository.findAll();
    }

    /** empty = a sector with this name already exists (conflict). */
    public Optional<Sector> createSector(Sector sector) {
        String name = sector.getName().trim();
        if (sectorRepository.existsByName(name)) {
            return Optional.empty();
        }
        sector.setName(name);
        return Optional.of(sectorRepository.save(sector));
    }

    public Optional<Sector> updateSector(Long id, String name) {
        return sectorRepository.findById(id).map(sector -> {
            if (name != null && !name.isBlank()) {
                sector.setName(name.trim());
            }
            return sectorRepository.save(sector);
        });
    }

    @Transactional
    public SectorDeleteResult deleteSector(Long id) {
        if (!sectorRepository.existsById(id)) {
            return SectorDeleteResult.NOT_FOUND;
        }
        if (sectorReportRepository.countBySectorId(id) > 0) {
            return SectorDeleteResult.HAS_REPORTS;
        }
        sectorRepository.deleteById(id);
        return SectorDeleteResult.DELETED;
    }

    // ── Sector reports ────────────────────────────────────────────────────────

    public Optional<List<SectorReport>> getReports(Long sectorId) {
        if (!sectorRepository.existsById(sectorId)) {
            return Optional.empty();
        }
        return Optional.of(sectorReportRepository.findBySectorIdOrderByCreatedAtDesc(sectorId));
    }

    public Optional<SectorReport> createReport(Long sectorId, String title, String content,
                                               String source, String reportDate, String category, Integer rating) {
        return sectorRepository.findById(sectorId).map(sector -> {
            SectorReport report = new SectorReport();
            report.setSector(sector);
            report.setTitle(title.trim());
            report.setContent(content);
            report.setSource(source);
            report.setReportDate(reportDate);
            report.setCategory(category);
            if (rating != null) report.setRating(Math.max(0, Math.min(5, rating)));
            return sectorReportRepository.save(report);
        });
    }

    public Optional<SectorReport> updateReport(Long sectorId, Long reportId, String title, String content,
                                               String source, String reportDate, String category, Integer rating) {
        return sectorReportRepository.findById(reportId)
                .filter(r -> r.getSector().getId().equals(sectorId))
                .map(report -> {
                    if (title != null && !title.isBlank()) {
                        report.setTitle(title.trim());
                    }
                    report.setContent(content);
                    report.setSource(source);
                    report.setReportDate(reportDate);
                    report.setCategory(category);
                    if (rating != null) report.setRating(Math.max(0, Math.min(5, rating)));
                    return sectorReportRepository.save(report);
                });
    }

    public Optional<SectorReport> updateReportRating(Long sectorId, Long reportId, int rating) {
        return sectorReportRepository.findById(reportId)
                .filter(r -> r.getSector().getId().equals(sectorId))
                .map(report -> {
                    report.setRating(rating);
                    return sectorReportRepository.save(report);
                });
    }

    public boolean deleteReport(Long sectorId, Long reportId) {
        return sectorReportRepository.findById(reportId)
                .filter(r -> r.getSector().getId().equals(sectorId))
                .map(report -> {
                    sectorReportRepository.delete(report);
                    return true;
                }).orElse(false);
    }

    public List<SectorReport> searchReports(String kw) {
        return sectorReportRepository.findAll().stream()
                .filter(r -> containsIgnoreCase(r.getTitle(), kw)
                          || containsIgnoreCase(r.getContent(), kw)
                          || containsIgnoreCase(r.getSource(), kw))
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .collect(Collectors.toList());
    }

    private static boolean containsIgnoreCase(String field, String kw) {
        return field != null && field.toLowerCase().contains(kw);
    }
}
