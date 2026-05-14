package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "earnings_reports")
@Data
@NoArgsConstructor
public class EarningsReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long stockId;

    @Column(nullable = false)
    private String stockCode;

    @Column(nullable = false)
    private String stockName;

    /** 财报标题，例如：2026Q1 业绩 */
    @Column(nullable = false, length = 200)
    private String title;

    /** 财报期，例如：2026Q1 */
    @Column(length = 20)
    private String fiscalPeriod;

    /** BEAT / MISS / IN_LINE */
    @Column(length = 20)
    private String result;

    /** 财报发布日期 */
    private LocalDate reportDate;

    /** 财报发布会记录（富文本 HTML） */
    @Lob
    @Column(columnDefinition = "CLOB")
    private String content;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
