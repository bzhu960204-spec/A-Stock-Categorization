package com.stockcard.repository;

import com.stockcard.entity.ValuationSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ValuationSnapshotRepository extends JpaRepository<ValuationSnapshot, Long> {

    @Query("SELECT v FROM ValuationSnapshot v ORDER BY v.snapshotDate DESC, v.createdAt DESC")
    List<ValuationSnapshot> findAllOrdered();

    @Query("SELECT v FROM ValuationSnapshot v WHERE v.ticker = :ticker ORDER BY v.snapshotDate DESC, v.createdAt DESC")
    List<ValuationSnapshot> findByTickerOrdered(String ticker);

    /** One row per ticker: [ticker, companyName] taken from that ticker's earliest snapshot, sorted by ticker. */
    @Query("SELECT v.ticker, v.companyName FROM ValuationSnapshot v " +
           "WHERE v.id IN (SELECT MIN(v2.id) FROM ValuationSnapshot v2 GROUP BY v2.ticker) ORDER BY v.ticker")
    List<Object[]> findCompanies();
}
