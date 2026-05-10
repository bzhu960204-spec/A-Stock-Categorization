package com.stockcard.repository;

import com.stockcard.entity.StockDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Set;

public interface StockDocumentRepository extends JpaRepository<StockDocument, Long> {
    List<StockDocument> findByStockIdOrderByCreatedAtDesc(Long stockId);

    void deleteByStockId(Long stockId);

    @Query(value = "SELECT DISTINCT stock_id FROM stock_documents WHERE LOWER(title) LIKE :pattern OR LOWER(content) LIKE :pattern", nativeQuery = true)
    Set<Long> findStockIdsByTitleOrContentContaining(@Param("pattern") String pattern);
}
