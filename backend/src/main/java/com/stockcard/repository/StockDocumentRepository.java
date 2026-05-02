package com.stockcard.repository;

import com.stockcard.entity.StockDocument;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StockDocumentRepository extends JpaRepository<StockDocument, Long> {
    List<StockDocument> findByStockIdOrderByCreatedAtDesc(Long stockId);

    void deleteByStockId(Long stockId);
}
