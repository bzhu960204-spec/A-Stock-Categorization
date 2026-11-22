package com.stockcard.service.liquidity.qe;

import java.time.LocalDate;

/** A page fetched from federalreserve.gov; {@code body} is blank when the text could not be extracted. */
public record FedDocument(String url, LocalDate docDate, String title, FedDocType docType, String body) {}
