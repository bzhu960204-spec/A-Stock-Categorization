package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** An in-app radar notification (qe-radar design §5.5). */
@Entity
@Table(name = "qe_radar_alert")
@Data
@NoArgsConstructor
public class QeRadarAlert {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** STAGE_CHANGE / LIKELIHOOD_CHANGE / TEXT_HIT */
    @Column(nullable = false, length = 30)
    private String alertType;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 2000)
    private String detail;

    private LocalDate refDate;

    @Column(nullable = false)
    private boolean acknowledged;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}
