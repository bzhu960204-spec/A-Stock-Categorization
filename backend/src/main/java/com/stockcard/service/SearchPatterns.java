package com.stockcard.service;

import java.util.Locale;

/** Builds case-insensitive "contains" patterns for native {@code LOWER(col) LIKE :pattern} queries. */
public final class SearchPatterns {

    private SearchPatterns() {}

    /**
     * Returns {@code %keyword%} with LIKE wildcards in the user input escaped, so "50%" or "a_b" match literally.
     * Uses backslash, which is H2's default LIKE escape character.
     */
    public static String contains(String keyword) {
        String kw = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT);
        String escaped = kw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return "%" + escaped + "%";
    }
}
