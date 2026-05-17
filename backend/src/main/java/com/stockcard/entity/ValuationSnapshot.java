package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "valuation_snapshots")
@Data
@NoArgsConstructor
public class ValuationSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 股票代码，如 "AAPL" / "600519" */
    @Column(nullable = false, length = 20)
    private String ticker;

    /** 公司名称，如 "Apple Inc." */
    @Column(nullable = false, length = 100)
    private String companyName;

    /** 本次估值的快照日期（可以是任意历史日期） */
    @Column(nullable = false)
    private LocalDate snapshotDate;

    /** 市盈率 Price / Earnings */
    private Double pe;

    /** 市销率 Price / Sales */
    private Double ps;

    /** 预期市盈率 Next Twelve Months P/E */
    private Double ntmPe;

    /** 预期市销率 Next Twelve Months P/S */
    private Double ntmPs;

    /** 毛利率（百分比，如 45.2 表示 45.2%） */
    private Double grossMargin;

    /** 过去四季度毛利率（Q1=最新季度，Q4=最早），百分比，如 45.2 表示 45.2% */
    private Double grossMarginQ1;
    private Double grossMarginQ2;
    private Double grossMarginQ3;
    private Double grossMarginQ4;

    /** 净利率（百分比） */
    private Double netMargin;

    /** 扣非净利润率 TTM Non-GAAP Net Margin（百分比） */
    private Double nonGaapNetMargin;

    /** 过去四季度净利率（Q1=最新季度，Q4=最早），百分比，如 5.2 表示 5.2% */
    private Double netMarginQ1;
    private Double netMarginQ2;
    private Double netMarginQ3;
    private Double netMarginQ4;

    /** 可选备注 */
    @Column(length = 500)
    private String notes;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        createdAt = LocalDateTime.now();
    }
}
