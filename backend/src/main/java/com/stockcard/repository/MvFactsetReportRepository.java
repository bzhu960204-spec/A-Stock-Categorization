package com.stockcard.repository;

import com.stockcard.entity.MvFactsetReport;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface MvFactsetReportRepository extends JpaRepository<MvFactsetReport, LocalDate> {

    List<MvFactsetReport> findAllByOrderByWeekFridayDesc(Pageable pageable);

    List<MvFactsetReport> findByWeekFridayGreaterThanEqual(LocalDate from);
}
