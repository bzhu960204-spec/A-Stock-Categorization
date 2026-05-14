package com.stockcard.repository;

import com.stockcard.entity.TechCyclePhase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TechCyclePhaseRepository extends JpaRepository<TechCyclePhase, Long> {
    List<TechCyclePhase> findByTechCycleIdOrderBySortOrderAscStartYearAsc(Long techCycleId);
    void deleteByTechCycleId(Long techCycleId);
}
