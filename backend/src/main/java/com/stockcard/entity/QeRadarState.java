package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** The last stage / likelihood the radar reported, so the next evaluation can tell whether it changed. */
@Entity
@Table(name = "qe_radar_state")
@Data
@NoArgsConstructor
public class QeRadarState {

    /** "stage" or "likelihood". */
    @Id
    @Column(length = 40)
    private String stateKey;

    @Column(nullable = false, length = 200)
    private String stateValue;

    @Column(nullable = false)
    private LocalDateTime updatedAt;
}
