package com.stockcard.repository;

import com.stockcard.entity.QeRadarState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface QeRadarStateRepository extends JpaRepository<QeRadarState, String> {
}
