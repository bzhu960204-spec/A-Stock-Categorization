package com.stockcard.repository;

import com.stockcard.entity.EarningsReport;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EarningsReportRepository extends JpaRepository<EarningsReport, Long> {
    List<EarningsReport> findByStockIdOrderByReportDateDescCreatedAtDesc(Long stockId);
    void deleteByStockId(Long stockId);

    @org.springframework.data.jpa.repository.Query(value = "SELECT DISTINCT stock_id FROM earnings_reports WHERE LOWER(title) LIKE :pattern", nativeQuery = true)
    java.util.Set<Long> findStockIdsByTitleContaining(@org.springframework.data.repository.query.Param("pattern") String pattern);
}
