package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "sectors")
@Data
@NoArgsConstructor
public class Sector {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name; // 行业名称，如 "半导体"、"消费"

    /** 整个文件夹是否已归档（手动控制，独立于研报的归档状态） */
    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean archived = false;
}
