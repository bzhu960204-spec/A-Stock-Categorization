package com.stockcard.repository;

import com.stockcard.entity.TechCycle;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TechCycleRepository extends JpaRepository<TechCycle, Long> {
}
