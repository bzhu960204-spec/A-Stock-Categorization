package com.stockcard.repository;

import com.stockcard.entity.LiquidityManualSeries;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LiquidityManualSeriesRepository extends JpaRepository<LiquidityManualSeries, String> {

    List<LiquidityManualSeries> findAllByOrderByCodeAsc();
}
