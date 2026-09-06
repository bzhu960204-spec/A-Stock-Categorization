package com.stockcard.repository;

import com.stockcard.entity.EarningsMonthFetch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface EarningsMonthFetchRepository extends JpaRepository<EarningsMonthFetch, String> {
}
