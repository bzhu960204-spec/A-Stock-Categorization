package com.stockcard.repository;

import com.stockcard.entity.StockTimeline;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StockTimelineRepository extends JpaRepository<StockTimeline, Long> {
    List<StockTimeline> findByStockIdOrderByCreatedAtDesc(Long stockId);
}
