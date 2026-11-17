package com.stockcard.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SearchPatternsTest {

    @Test
    void wrapsLowercasedTrimmedKeyword() {
        assertThat(SearchPatterns.contains("  NVDA ")).isEqualTo("%nvda%");
    }

    @Test
    void escapesLikeWildcardsAndEscapeCharacter() {
        assertThat(SearchPatterns.contains("50%")).isEqualTo("%50\\%%");
        assertThat(SearchPatterns.contains("a_b")).isEqualTo("%a\\_b%");
        assertThat(SearchPatterns.contains("c:\\x")).isEqualTo("%c:\\\\x%");
    }

    @Test
    void nullBecomesMatchAll() {
        assertThat(SearchPatterns.contains(null)).isEqualTo("%%");
    }
}
