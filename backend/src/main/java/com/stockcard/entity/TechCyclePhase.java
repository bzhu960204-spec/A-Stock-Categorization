package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "tech_cycle_phases")
@Data
@NoArgsConstructor
public class TechCyclePhase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long techCycleId;

    /** 阶段标题，如"爆发增长期" */
    @Column(nullable = false, length = 200)
    private String title;

    /**
     * 阶段类型（用于颜色渲染）：
     * BUDDING（萌芽）/ GROWTH（成长）/ BOOM（爆发）/ MATURE（成熟）/ DECLINE（衰退）/ CUSTOM
     */
    @Column(length = 30)
    private String phaseType;

    /** 开始年份，如 2025 */
    @Column(nullable = false)
    private Integer startYear;

    /** 开始季度（1-4），可选 */
    private Integer startQuarter;

    /** 结束年份 */
    @Column(nullable = false)
    private Integer endYear;

    /** 结束季度（1-4），可选 */
    private Integer endQuarter;

    /** 详细描述 */
    @Lob
    @Column(columnDefinition = "CLOB")
    private String notes;

    /** 显示顺序 */
    @Column(nullable = false)
    private Integer sortOrder = 0;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
