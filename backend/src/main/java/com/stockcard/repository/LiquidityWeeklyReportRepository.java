package com.stockcard.repository;

import com.stockcard.entity.LiquidityWeeklyReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface LiquidityWeeklyReportRepository extends JpaRepository<LiquidityWeeklyReport, Long> {

    Optional<LiquidityWeeklyReport> findByWeekEnd(LocalDate weekEnd);

    List<LiquidityWeeklyReport> findAllByOrderByWeekEndDesc();
}
