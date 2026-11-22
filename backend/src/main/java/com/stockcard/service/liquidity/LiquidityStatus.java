package com.stockcard.service.liquidity;

/** Traffic-light state of an indicator; NONE means "observe only" (no enabled threshold, or no data). */
public enum LiquidityStatus {
    NONE, GREEN, YELLOW, RED;

    /** The more severe of two states, where RED > YELLOW > GREEN > NONE. */
    public static LiquidityStatus worse(LiquidityStatus a, LiquidityStatus b) {
        return a.ordinal() >= b.ordinal() ? a : b;
    }
}
