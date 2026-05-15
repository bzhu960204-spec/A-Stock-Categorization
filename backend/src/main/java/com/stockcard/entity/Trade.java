package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "trades")
@Data
@NoArgsConstructor
public class Trade {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "category_id")
    private TradeCategory category;

    @Column(nullable = false, length = 200)
    private String title;

    /** 子分类标签（自由文本，隶属于文件夹分类之下） */
    @Column(length = 100)
    private String subCategory;

    /** 交易记录内容（富文本 HTML） */
    @Lob
    @Column(columnDefinition = "CLOB")
    private String content;

    /** 评星 0-5，0 表示未评星 */
    @Column(nullable = false, columnDefinition = "integer default 0")
    private int rating = 0;

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
