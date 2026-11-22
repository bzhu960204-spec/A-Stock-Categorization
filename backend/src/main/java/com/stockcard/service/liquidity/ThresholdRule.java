package com.stockcard.service.liquidity;

/** A traffic-light rule for one series (design §3.4). */
public record ThresholdRule(String code, Direction direction, double yellow, double red, boolean enabled) {

    public enum Direction { HIGHER_IS_WORSE, LOWER_IS_WORSE }

    /** Evaluates the latest value; thresholds are inclusive (a value exactly at yellow / red already counts). */
    public LiquidityStatus evaluate(Double latest) {
        if (!enabled || latest == null) return LiquidityStatus.NONE;
        if (direction == Direction.HIGHER_IS_WORSE) {
            if (latest >= red) return LiquidityStatus.RED;
            if (latest >= yellow) return LiquidityStatus.YELLOW;
        } else {
            if (latest <= red) return LiquidityStatus.RED;
            if (latest <= yellow) return LiquidityStatus.YELLOW;
        }
        return LiquidityStatus.GREEN;
    }

    /** yellow must be on the "better" side of red for the chosen direction. */
    public boolean isConsistent() {
        return direction == Direction.HIGHER_IS_WORSE ? yellow <= red : yellow >= red;
    }
}
