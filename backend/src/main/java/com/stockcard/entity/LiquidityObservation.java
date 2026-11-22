package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** One observation of one series. Writes go through a batched MERGE (LiquiditySyncService); this entity is for reads. */
@Entity
@Table(name = "liquidity_observation")
@IdClass(LiquidityObservationId.class)
@Data
@NoArgsConstructor
public class LiquidityObservation {

    @Id
    @Column(length = 40)
    private String seriesCode;

    @Id
    private LocalDate obsDate;

    @Column(nullable = false)
    private double obsValue;

    @Column(nullable = false, length = 20)
    private String source;

    @Column(nullable = false)
    private LocalDateTime fetchedAt;
}
