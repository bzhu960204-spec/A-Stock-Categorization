package com.stockcard.repository;

import com.stockcard.entity.SectorReport;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SectorReportRepository extends JpaRepository<SectorReport, Long> {
    List<SectorReport> findBySectorIdOrderByCreatedAtDesc(Long sectorId);
    long countBySectorId(Long sectorId);
    void deleteBySectorId(Long sectorId);
}
