package com.stockcard.repository;

import com.stockcard.entity.LiquidityObservation;
import com.stockcard.entity.LiquidityObservationId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface LiquidityObservationRepository extends JpaRepository<LiquidityObservation, LiquidityObservationId> {

    List<LiquidityObservation> findBySeriesCodeAndObsDateBetweenOrderByObsDateAsc(String seriesCode, LocalDate from, LocalDate to);

    boolean existsBySeriesCode(String seriesCode);

    @Query("select min(o.obsDate) from LiquidityObservation o where o.seriesCode = :code")
    LocalDate minObsDate(@Param("code") String code);

    @Query("select max(o.obsDate) from LiquidityObservation o where o.source = :source")
    LocalDate maxObsDateBySource(@Param("source") String source);

    @Modifying
    @Query("delete from LiquidityObservation o where o.seriesCode = :code")
    int deleteAllBySeriesCode(@Param("code") String code);
}
