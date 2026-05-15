package com.stockcard.repository;

import com.stockcard.entity.Trade;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TradeRepository extends JpaRepository<Trade, Long> {
    List<Trade> findByCategoryIdOrderByCreatedAtDesc(Long categoryId);
    List<Trade> findAllByOrderByCreatedAtDesc();
    long countByCategoryId(Long categoryId);
}
