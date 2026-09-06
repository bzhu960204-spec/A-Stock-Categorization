package com.stockcard.repository;

import com.stockcard.entity.EarningsCalendarEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface EarningsCalendarEntryRepository extends JpaRepository<EarningsCalendarEntry, Long> {

    List<EarningsCalendarEntry> findByEntryDateBetween(LocalDate start, LocalDate end);

    @Transactional
    void deleteByEntryDate(LocalDate entryDate);
}
