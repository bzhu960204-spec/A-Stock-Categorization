package com.stockcard.service.liquidity;

public enum LiquiditySource {
    NYFED, TREASURY, FRED, MANUAL,
    /** Fed press releases (qe-radar design §4.3): produces text events, not observations. */
    FEDTEXT
}
