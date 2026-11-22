package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** One observation of one series. Writes go through a batched MERGE (MvSyncService); this entity is for reads and manual edits. */
@Entity
@Table(name = "mv_observation")
@IdClass(MvObservationId.class)
@Data
@NoArgsConstructor
public class MvObservation {

    @Id
    @Column(length = 48)
    private String seriesCode;

    @Id
    private LocalDate obsDate;

    @Column(nullable = false)
    private double obsValue;

    @Column(nullable = false, length = 20)
    private String source;

    @Column(nullable = false)
    private boolean estimate;

    @Column(nullable = false)
    private LocalDateTime fetchedAt;
}
