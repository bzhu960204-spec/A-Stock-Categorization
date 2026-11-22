package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Books one FactSet Earnings Insight week so the back-fill knows what has been processed. */
@Entity
@Table(name = "mv_factset_report")
@Data
@NoArgsConstructor
public class MvFactsetReport {

    /** The Friday of the week this row books. */
    @Id
    private LocalDate weekFriday;

    /** Date in the file name (Friday or Thursday); null when NOT_FOUND. */
    private LocalDate reportDate;

    @Column(length = 60)
    private String fileName;

    /** PARSED / PARSE_FAILED / NOT_FOUND */
    @Column(nullable = false, length = 20)
    private String status;

    @Column(length = 10)
    private String fiscalQuarter;

    @Column(length = 1000)
    private String message;

    @Column(nullable = false)
    private LocalDateTime fetchedAt;
}
