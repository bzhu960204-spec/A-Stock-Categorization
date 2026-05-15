package com.stockcard.repository;

import com.stockcard.entity.IdeaCategory;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IdeaCategoryRepository extends JpaRepository<IdeaCategory, Long> {
    boolean existsByName(String name);
}
