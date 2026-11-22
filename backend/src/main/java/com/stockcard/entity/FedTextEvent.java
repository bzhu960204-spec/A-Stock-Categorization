package com.stockcard.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** One Fed press release (statement, implementation note, minutes...) with its classification (qe-radar design §5.2). */
@Entity
@Table(name = "fed_text_event")
@Data
@NoArgsConstructor
public class FedTextEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 300)
    private String url;

    @Column(nullable = false)
    private LocalDate docDate;

    @Column(nullable = false, length = 500)
    private String title;

    /** STATEMENT / IMPL_NOTE / MINUTES / OTHER */
    @Column(nullable = false, length = 20)
    private String docType;

    @Lob
    @Column(nullable = false, columnDefinition = "CLOB")
    private String body;

    /** Comma separated category codes; empty when nothing matched. */
    @Column(nullable = false, length = 200)
    private String categories;

    /** JSON: [{"category": "RMP", "sentence": "..."}] */
    @Lob
    @Column(nullable = false, columnDefinition = "CLOB")
    private String hits;

    @Column(nullable = false)
    private double stance;

    @Lob
    @Column(columnDefinition = "CLOB")
    private String directive;

    /** JSON: {"added": [...], "removed": [...]}; null for the first note or when nothing changed. */
    @Lob
    @Column(columnDefinition = "CLOB")
    private String directiveChanges;

    @Column(nullable = false)
    private LocalDateTime fetchedAt;
}
