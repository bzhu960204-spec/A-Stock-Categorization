package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "sector_reports")
@Data
@NoArgsConstructor
public class SectorReport {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sector_id", nullable = false)
    private Sector sector;

    @Column(nullable = false)
    private String title; // 报告标题

    @Lob
    @Column(columnDefinition = "CLOB")
    private String content; // 报告内容（Markdown）

    @Column
    private String source; // 来源，如 "中信证券"

    @Column
    private String reportDate; // 报告日期，如 "2026-04-01"

    @Column(length = 100)
    private String category; // 自由分类标签

    @Column(nullable = false, columnDefinition = "integer default 0")
    private int rating = 0; // 评星 0-5

    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean archived = false; // 是否已归档

    private LocalDateTime archivedAt; // 归档时间，恢复时置 null

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
