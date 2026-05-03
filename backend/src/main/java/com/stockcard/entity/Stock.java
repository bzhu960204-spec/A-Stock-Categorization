package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "stocks")
@Data
@NoArgsConstructor
public class Stock {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String code; // 股票代码，如 "600519"

    @Column(nullable = false)
    private String name; // 股票名称，如 "贵州茅台"

    @Column(length = 1000)
    private String notes; // 备注/基本情况

    @Lob
    @Column(columnDefinition = "CLOB")
    private String business; // 业务

    @Lob
    @Column(columnDefinition = "CLOB")
    private String customers; // 客户

    @Lob
    @Column(columnDefinition = "CLOB")
    private String competitors; // 竞争对手

    @Lob
    @Column(columnDefinition = "CLOB")
    private String strengths; // 竞争优势

    @Lob
    @Column(columnDefinition = "CLOB")
    private String structuralWeaknesses; // 结构性弱点

    @Lob
    @Column(columnDefinition = "CLOB")
    private String future; // 面向未来

    @Lob
    @Column(name = "strengths_weaknesses", insertable = false, updatable = false)
    private String strengthsWeaknessesLegacy; // 兼容历史单字段数据

    @Lob
    @Column(columnDefinition = "CLOB")
    private String founderCeoHolding; // 创始人CEO及持股

    @Column(length = 10)
    private String market = "CN"; // CN = A股, US = 美股

    @Column(name = "research_value")
    private Integer researchValue = 0; // 研究价值评级 0-5星

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "stock_categories",
        joinColumns = @JoinColumn(name = "stock_id"),
        inverseJoinColumns = @JoinColumn(name = "category_id")
    )
    private Set<Category> categories = new HashSet<>();
}
