package com.stockcard.repository;

import com.stockcard.entity.EarningsNote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface EarningsNoteRepository extends JpaRepository<EarningsNote, Long> {

    Optional<EarningsNote> findByTickerAndNoteDate(String ticker, LocalDate noteDate);
}
