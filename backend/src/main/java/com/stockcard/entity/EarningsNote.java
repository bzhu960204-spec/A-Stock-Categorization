package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 针对某公司某次财报的 Markdown 笔记（ticker + noteDate 唯一）。 */
@Entity
@Table(name = "earnings_notes",
        uniqueConstraints = @UniqueConstraint(name = "uk_en_ticker_date", columnNames = {"ticker", "noteDate"}))
@Data
@NoArgsConstructor
public class EarningsNote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String ticker;

    @Column(nullable = false)
    private LocalDate noteDate;

    @Lob
    @Column(columnDefinition = "CLOB")
    private String content;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void touch() {
        updatedAt = LocalDateTime.now();
    }
}
