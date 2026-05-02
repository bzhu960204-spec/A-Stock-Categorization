package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "stock_timeline")
@Data
@NoArgsConstructor
public class StockTimeline {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long stockId;

    @Column(nullable = false)
    private String stockCode;

    @Column(nullable = false)
    private String stockName;

    @Column(nullable = false, length = 50)
    private String actionType; // CREATE / UPDATE / CATEGORY / DELETE

    @Lob
    @Column(columnDefinition = "CLOB")
    private String description;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
