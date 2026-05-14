package com.stockcard.repository;

import com.stockcard.entity.EarningsReport;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EarningsReportRepository extends JpaRepository<EarningsReport, Long> {
    List<EarningsReport> findByStockIdOrderByReportDateDescCreatedAtDesc(Long stockId);
    void deleteByStockId(Long stockId);
}
