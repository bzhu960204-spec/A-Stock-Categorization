package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** 记录某个月份（"YYYY-MM"）最近一次拉取财报日历的时间。 */
@Entity
@Table(name = "earnings_month_fetches")
@Data
@NoArgsConstructor
public class EarningsMonthFetch {

    @Id
    @Column(length = 7)
    private String monthKey;

    @Column(nullable = false)
    private LocalDateTime fetchedAt;
}
