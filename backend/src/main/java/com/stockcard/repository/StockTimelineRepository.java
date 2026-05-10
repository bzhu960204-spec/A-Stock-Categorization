package com.stockcard.repository;

import com.stockcard.entity.StockTimeline;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Set;

public interface StockTimelineRepository extends JpaRepository<StockTimeline, Long> {
    List<StockTimeline> findByStockIdOrderByCreatedAtDesc(Long stockId);

    @Query(value = "SELECT DISTINCT stock_id FROM stock_timeline WHERE LOWER(description) LIKE :pattern", nativeQuery = true)
    Set<Long> findStockIdsByDescriptionContaining(@Param("pattern") String pattern);
}
