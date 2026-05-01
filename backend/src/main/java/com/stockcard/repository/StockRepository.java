package com.stockcard.repository;

import com.stockcard.entity.Stock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface StockRepository extends JpaRepository<Stock, Long> {
    Optional<Stock> findByCode(String code);
    List<Stock> findByNameContaining(String name);

    // 并集：包含任意一个分类的股票
    @Query("SELECT DISTINCT s FROM Stock s JOIN s.categories c WHERE c.id IN :categoryIds")
    List<Stock> findByAnyCategoryIds(@Param("categoryIds") Set<Long> categoryIds);

    // 交集：同时包含所有分类的股票
    @Query("SELECT s FROM Stock s JOIN s.categories c WHERE c.id IN :categoryIds GROUP BY s HAVING COUNT(DISTINCT c.id) = :count")
    List<Stock> findByAllCategoryIds(@Param("categoryIds") Set<Long> categoryIds, @Param("count") long count);
}
