package com.stockcard.repository;

import com.stockcard.entity.SectorReport;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SectorReportRepository extends JpaRepository<SectorReport, Long> {
    List<SectorReport> findBySectorIdOrderByCreatedAtDesc(Long sectorId);
    List<SectorReport> findBySectorIdAndArchivedFalseOrderByCreatedAtDesc(Long sectorId);
    List<SectorReport> findBySectorIdAndArchivedTrueOrderByCreatedAtDesc(Long sectorId);
    List<SectorReport> findByArchivedTrueOrderByCreatedAtDesc();
    List<SectorReport> findByArchivedFalseOrderByCreatedAtDesc();
    long countBySectorId(Long sectorId);
    void deleteBySectorId(Long sectorId);
}
