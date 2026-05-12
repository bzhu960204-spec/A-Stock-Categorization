package com.stockcard.repository;

import com.stockcard.entity.MarketEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface MarketEventRepository extends JpaRepository<MarketEvent, Long> {

    List<MarketEvent> findByEventDateBetweenOrderByEventDateAsc(LocalDate start, LocalDate end);

    List<MarketEvent> findByEventDateOrderByCreatedAtAsc(LocalDate date);
}
