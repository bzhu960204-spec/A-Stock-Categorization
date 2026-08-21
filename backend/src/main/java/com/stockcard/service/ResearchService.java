package com.stockcard.service;

import com.stockcard.entity.Sector;
import com.stockcard.entity.SectorReport;
import com.stockcard.repository.SectorRepository;
import com.stockcard.repository.SectorReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
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

    /** 归档整个文件夹：把该行业下所有未归档研报一并归档，并把行业标记为归档。 */
    @Transactional
    public Optional<Sector> archiveSector(Long id) {
        return sectorRepository.findById(id).map(sector -> {
            LocalDateTime now = LocalDateTime.now();
            List<SectorReport> active = sectorReportRepository.findBySectorIdAndArchivedFalseOrderByCreatedAtDesc(id);
            active.forEach(report -> {
                report.setArchived(true);
                report.setArchivedAt(now);
            });
            sectorReportRepository.saveAll(active);
            sector.setArchived(true);
            return sectorRepository.save(sector);
        });
    }

    /** 恢复整个文件夹：把该行业下所有已归档研报一并恢复，并把行业标记为活跃。 */
    @Transactional
    public Optional<Sector> unarchiveSector(Long id) {
        return sectorRepository.findById(id).map(sector -> {
            List<SectorReport> archived = sectorReportRepository.findBySectorIdAndArchivedTrueOrderByCreatedAtDesc(id);
            archived.forEach(report -> {
                report.setArchived(false);
                report.setArchivedAt(null);
            });
            sectorReportRepository.saveAll(archived);
            sector.setArchived(false);
            return sectorRepository.save(sector);
        });
    }

    // ── Sector reports ────────────────────────────────────────────────────────

    public Optional<List<SectorReport>> getReports(Long sectorId) {
        if (!sectorRepository.existsById(sectorId)) {
            return Optional.empty();
        }
        return Optional.of(sectorReportRepository.findBySectorIdAndArchivedFalseOrderByCreatedAtDesc(sectorId));
    }

    public List<SectorReport> getAllActiveReports() {
        return sectorReportRepository.findByArchivedFalseOrderByCreatedAtDesc();
    }

    public List<SectorReport> getArchivedReports() {
        return sectorReportRepository.findByArchivedTrueOrderByCreatedAtDesc();
    }

    @Transactional
    public Optional<SectorReport> setReportArchived(Long sectorId, Long reportId, boolean archived) {
        return sectorReportRepository.findById(reportId)
                .filter(r -> r.getSector().getId().equals(sectorId))
                .map(report -> {
                    report.setArchived(archived);
                    report.setArchivedAt(archived ? java.time.LocalDateTime.now() : null);
                    // 恢复单篇时，若其行业处于归档态，则一并恢复行业（否则该研报无处显示）
                    if (!archived && report.getSector().isArchived()) {
                        report.getSector().setArchived(false);
                        sectorRepository.save(report.getSector());
                    }
                    return sectorReportRepository.save(report);
                });
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
                                               String source, String reportDate, String category, Integer rating,
                                               Long targetSectorId) {
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
                    if (targetSectorId != null && !targetSectorId.equals(sectorId)) {
                        sectorRepository.findById(targetSectorId).ifPresent(report::setSector);
                    }
                    return sectorReportRepository.save(report);
                });
    }

    /** Move a report to another sector. empty = report/target not found. */
    public Optional<SectorReport> moveReport(Long sectorId, Long reportId, Long targetSectorId) {
        if (targetSectorId == null) return Optional.empty();
        return sectorReportRepository.findById(reportId)
                .filter(r -> r.getSector().getId().equals(sectorId))
                .flatMap(report -> sectorRepository.findById(targetSectorId).map(target -> {
                    report.setSector(target);
                    return sectorReportRepository.save(report);
                }));
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
                .filter(r -> !r.isArchived())
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
