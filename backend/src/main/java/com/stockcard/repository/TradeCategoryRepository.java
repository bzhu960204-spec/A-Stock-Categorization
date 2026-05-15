package com.stockcard.repository;

import com.stockcard.entity.TradeCategory;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TradeCategoryRepository extends JpaRepository<TradeCategory, Long> {
    boolean existsByName(String name);
}
