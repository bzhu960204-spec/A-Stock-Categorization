package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "idea_categories")
@Data
@NoArgsConstructor
public class IdeaCategory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String name;

    /** 整个文件夹是否已归档（手动控制，独立于文章的归档状态） */
    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean archived = false;
}
