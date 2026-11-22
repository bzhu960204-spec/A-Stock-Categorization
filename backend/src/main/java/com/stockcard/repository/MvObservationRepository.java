package com.stockcard.repository;

import com.stockcard.entity.MvObservation;
import com.stockcard.entity.MvObservationId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface MvObservationRepository extends JpaRepository<MvObservation, MvObservationId> {

    @Query("select o from MvObservation o where o.seriesCode = :code and o.obsDate >= :from and o.obsDate <= :to order by o.obsDate asc")
    List<MvObservation> findRange(@Param("code") String code, @Param("from") LocalDate from, @Param("to") LocalDate to);

    boolean existsBySeriesCode(String seriesCode);

    @Query("select max(o.obsDate) from MvObservation o where o.seriesCode = :code")
    LocalDate maxObsDate(@Param("code") String code);

    @Query("select max(o.obsDate) from MvObservation o where o.source = :source")
    LocalDate maxObsDateBySource(@Param("source") String source);

    @Modifying
    @Query("delete from MvObservation o where o.seriesCode = :code")
    int deleteAllBySeriesCode(@Param("code") String code);
}
