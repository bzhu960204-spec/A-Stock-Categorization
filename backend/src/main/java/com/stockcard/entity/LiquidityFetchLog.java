package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "liquidity_fetch_log")
@Data
@NoArgsConstructor
public class LiquidityFetchLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String source;

    /** INCREMENTAL / FULL */
    @Column(nullable = false, length = 20)
    private String mode;

    private LocalDate rangeFrom;

    private LocalDate rangeTo;

    @Column(nullable = false)
    private LocalDateTime startedAt;

    private LocalDateTime finishedAt;

    /** RUNNING / SUCCESS / FAILED / SKIPPED */
    @Column(nullable = false, length = 20)
    private String status;

    @Column(nullable = false)
    private int rowsUpserted;

    @Column(length = 1000)
    private String message;
}
