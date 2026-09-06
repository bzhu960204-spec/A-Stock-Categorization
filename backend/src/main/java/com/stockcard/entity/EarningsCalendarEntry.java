package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 美股财报日历中的一条记录（某公司某天发布财报）。 */
@Entity
@Table(name = "earnings_calendar_entries",
        indexes = @Index(name = "idx_ece_date", columnList = "entryDate"))
@Data
@NoArgsConstructor
public class EarningsCalendarEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String ticker;

    @Column(length = 200)
    private String name;

    @Column(nullable = false)
    private LocalDate entryDate;

    /** 盘前 / 盘后 / 未公布 */
    @Column(length = 20)
    private String reportTime;

    /** 格式化市值，如 "~210B" */
    @Column(length = 30)
    private String marketCap;

    private Long marketCapRaw;

    private boolean sp500;

    @Column(length = 60)
    private String sector;

    @Column(length = 30)
    private String epsForecast;

    @Column(length = 30)
    private String epsActual;

    @Column(length = 30)
    private String surprise;

    private int numEstimates;

    /** Nasdaq 是否已确认发布时间 */
    private boolean confirmed;

    /** 是否已公布实际 EPS */
    private boolean reported;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
