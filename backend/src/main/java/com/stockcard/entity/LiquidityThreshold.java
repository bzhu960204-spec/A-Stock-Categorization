package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** A customised threshold; indicators without a row use the code defaults (LiquidityThresholdService). */
@Entity
@Table(name = "liquidity_threshold")
@Data
@NoArgsConstructor
public class LiquidityThreshold {

    @Id
    @Column(length = 40)
    private String seriesCode;

    @Column(nullable = false, length = 20)
    private String direction;

    @Column(nullable = false)
    private double yellow;

    @Column(nullable = false)
    private double red;

    @Column(nullable = false)
    private boolean enabled;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void touch() {
        updatedAt = LocalDateTime.now();
    }
}
