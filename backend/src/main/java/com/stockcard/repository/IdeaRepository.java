package com.stockcard.repository;

import com.stockcard.entity.Idea;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface IdeaRepository extends JpaRepository<Idea, Long> {
    List<Idea> findByCategoryIdOrderByCreatedAtDesc(Long categoryId);
    List<Idea> findByCategoryIdAndArchivedFalseOrderByCreatedAtDesc(Long categoryId);
    List<Idea> findByCategoryIdAndArchivedTrueOrderByCreatedAtDesc(Long categoryId);
    List<Idea> findAllByOrderByCreatedAtDesc();
    List<Idea> findByArchivedFalseOrderByCreatedAtDesc();
    List<Idea> findByArchivedTrueOrderByCreatedAtDesc();
    // 原生查询：content 为 @Lob CLOB，HQL 的 LOWER() 不支持 CLOB，需走 SQL（排除归档）
    @Query(value = "SELECT * FROM ideas WHERE archived = false AND (LOWER(title) LIKE :kw OR LOWER(content) LIKE :kw) ORDER BY created_at DESC", nativeQuery = true)
    List<Idea> searchByKeyword(@Param("kw") String kw);
    long countByCategoryId(Long categoryId);
}
