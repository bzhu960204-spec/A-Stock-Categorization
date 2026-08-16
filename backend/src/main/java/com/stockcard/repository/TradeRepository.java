package com.stockcard.repository;

import com.stockcard.entity.Trade;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TradeRepository extends JpaRepository<Trade, Long> {
    List<Trade> findByCategoryIdOrderByCreatedAtDesc(Long categoryId);
    List<Trade> findAllByOrderByCreatedAtDesc();
    // 原生查询：content 为 @Lob CLOB，HQL 的 LOWER() 不支持 CLOB，需走 SQL
    @Query(value = "SELECT * FROM trades WHERE LOWER(title) LIKE :kw OR LOWER(content) LIKE :kw ORDER BY created_at DESC", nativeQuery = true)
    List<Trade> searchByKeyword(@Param("kw") String kw);
    long countByCategoryId(Long categoryId);
}
