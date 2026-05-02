package com.stockcard.repository;

import com.stockcard.entity.StockImage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StockImageRepository extends JpaRepository<StockImage, Long> {
}
