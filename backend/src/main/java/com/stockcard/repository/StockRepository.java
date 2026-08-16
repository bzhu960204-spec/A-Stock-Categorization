package com.stockcard.repository;

import com.stockcard.entity.Stock;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface StockRepository extends JpaRepository<Stock, Long> {
    Optional<Stock> findByCode(String code);
    List<Stock> findByNameContaining(String name);

    // 一次性抓取分类，避免序列化时的 N+1
    @Override
    @EntityGraph(attributePaths = "categories")
    List<Stock> findAll();

    // 并集：包含任意一个分类的股票
    @EntityGraph(attributePaths = "categories")
    @Query("SELECT DISTINCT s FROM Stock s JOIN s.categories c WHERE c.id IN :categoryIds")
    List<Stock> findByAnyCategoryIds(@Param("categoryIds") Set<Long> categoryIds);

    // 交集：同时包含所有分类的股票
    @Query("SELECT s FROM Stock s JOIN s.categories c WHERE c.id IN :categoryIds GROUP BY s HAVING COUNT(DISTINCT c.id) = :count")
    List<Stock> findByAllCategoryIds(@Param("categoryIds") Set<Long> categoryIds, @Param("count") long count);

    // 关键字搜索：匹配任一档案字段，或命中文档/日志/财报的股票 id（多个字段为 @Lob CLOB，走原生 SQL）
    @Query(value = "SELECT * FROM stocks WHERE " +
           "LOWER(code) LIKE :kw OR LOWER(name) LIKE :kw OR LOWER(notes) LIKE :kw OR " +
           "LOWER(recommender) LIKE :kw OR LOWER(business) LIKE :kw OR LOWER(customers) LIKE :kw OR " +
           "LOWER(competitors) LIKE :kw OR LOWER(strengths) LIKE :kw OR LOWER(structural_weaknesses) LIKE :kw OR " +
           "LOWER(future) LIKE :kw OR LOWER(founder_ceo_holding) LIKE :kw OR id IN (:ids) " +
           "ORDER BY id", nativeQuery = true)
    List<Stock> searchByFieldsOrIds(@Param("kw") String kw, @Param("ids") Set<Long> ids);
}
