package com.stockcard.repository;

import com.stockcard.entity.IndustryChain;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface IndustryChainRepository extends JpaRepository<IndustryChain, Long> {
    List<IndustryChain> findByStockIdOrderByCreatedAtAsc(Long stockId);
    void deleteByStockId(Long stockId);
}
