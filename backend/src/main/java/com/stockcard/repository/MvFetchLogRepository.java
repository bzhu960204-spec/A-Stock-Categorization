package com.stockcard.repository;

import com.stockcard.entity.MvFetchLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface MvFetchLogRepository extends JpaRepository<MvFetchLog, Long> {

    List<MvFetchLog> findTop20ByOrderByIdDesc();

    List<MvFetchLog> findByStatus(String status);

    Optional<MvFetchLog> findFirstBySourceOrderByIdDesc(String source);

    Optional<MvFetchLog> findFirstBySourceAndStatusInOrderByIdDesc(String source, Collection<String> statuses);

    Optional<MvFetchLog> findFirstByStatusInOrderByIdDesc(Collection<String> statuses);
}
