package com.stockcard.service.liquidity;

/** Published once a sync run has finished and released its lock, whatever the outcome of the individual sources. */
public record LiquiditySyncFinishedEvent(LiquiditySyncService.Mode mode) {}
