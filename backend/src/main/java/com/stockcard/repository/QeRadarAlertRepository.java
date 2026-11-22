package com.stockcard.repository;

import com.stockcard.entity.QeRadarAlert;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface QeRadarAlertRepository extends JpaRepository<QeRadarAlert, Long> {

    List<QeRadarAlert> findAllByOrderByIdDesc(Pageable pageable);

    List<QeRadarAlert> findByAcknowledgedFalseOrderByIdDesc(Pageable pageable);

    long countByAcknowledgedFalse();

    @Modifying
    @Query("update QeRadarAlert a set a.acknowledged = true where a.acknowledged = false")
    int acknowledgeAll();
}
