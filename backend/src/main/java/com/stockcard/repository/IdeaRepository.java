package com.stockcard.repository;

import com.stockcard.entity.Idea;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface IdeaRepository extends JpaRepository<Idea, Long> {
    List<Idea> findByCategoryIdOrderByCreatedAtDesc(Long categoryId);
    List<Idea> findAllByOrderByCreatedAtDesc();
    long countByCategoryId(Long categoryId);
}
