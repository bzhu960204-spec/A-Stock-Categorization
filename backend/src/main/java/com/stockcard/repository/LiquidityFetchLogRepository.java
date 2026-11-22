package com.stockcard.repository;

import com.stockcard.entity.LiquidityFetchLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LiquidityFetchLogRepository extends JpaRepository<LiquidityFetchLog, Long> {

    List<LiquidityFetchLog> findTop20ByOrderByIdDesc();

    List<LiquidityFetchLog> findByStatus(String status);

    Optional<LiquidityFetchLog> findFirstBySourceOrderByIdDesc(String source);

    Optional<LiquidityFetchLog> findFirstBySourceAndStatusOrderByIdDesc(String source, String status);

    Optional<LiquidityFetchLog> findFirstByStatusOrderByIdDesc(String status);
}
