package com.stockcard.repository;

import com.stockcard.entity.MvManualSeries;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MvManualSeriesRepository extends JpaRepository<MvManualSeries, String> {

    List<MvManualSeries> findAllByOrderByCodeAsc();
}
