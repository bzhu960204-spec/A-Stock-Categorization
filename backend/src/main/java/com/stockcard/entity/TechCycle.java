package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "tech_cycles")
@Data
@NoArgsConstructor
public class TechCycle {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 技术/板块名称，如"人工智能"、"新能源汽车" */
    @Column(nullable = false, length = 200)
    private String name;

    /** 简短描述 */
    @Column(length = 500)
    private String description;

    /** 标识颜色（hex，如 #6366f1） */
    @Column(length = 20)
    private String color;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
