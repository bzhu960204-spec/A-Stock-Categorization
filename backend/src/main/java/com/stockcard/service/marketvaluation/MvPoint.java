package com.stockcard.service.marketvaluation;

import java.time.LocalDate;

/** One fetched observation; {@code estimate} marks values the source itself flags as estimated (multpl's dagger). */
public record MvPoint(LocalDate date, double value, boolean estimate) {
}
