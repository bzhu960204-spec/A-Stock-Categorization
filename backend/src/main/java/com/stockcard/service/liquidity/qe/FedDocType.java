package com.stockcard.service.liquidity.qe;

public enum FedDocType {
    STATEMENT, IMPL_NOTE, MINUTES, OTHER;

    /** From the page title: "FOMC statement", "Minutes ..." or "Implementation Note ...". */
    public static FedDocType fromTitle(String title) {
        String t = title == null ? "" : title;
        if (t.contains("Implementation Note")) return IMPL_NOTE;
        if (t.contains("FOMC statement")) return STATEMENT;
        if (t.contains("Minutes")) return MINUTES;
        return OTHER;
    }
}
