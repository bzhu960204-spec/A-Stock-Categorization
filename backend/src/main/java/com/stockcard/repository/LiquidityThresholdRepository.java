package com.stockcard.repository;

import com.stockcard.entity.LiquidityThreshold;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface LiquidityThresholdRepository extends JpaRepository<LiquidityThreshold, String> {
}
