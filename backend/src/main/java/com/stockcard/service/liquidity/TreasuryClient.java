package com.stockcard.service.liquidity;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** US Treasury Fiscal Data: daily Treasury General Account balance from the DTS (design §4.3). */
@Component
public class TreasuryClient implements LiquiditySourceClient {

    private static final String ENDPOINT =
            "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance";
    private static final int PAGE_SIZE = 10000;
    private static final int MAX_PAGES = 50;

    private static final String TYPE_CLOSING = "Treasury General Account (TGA) Closing Balance";
    private static final String TYPE_TGA = "Treasury General Account (TGA)";
    private static final String TYPE_FED = "Federal Reserve Account";
    /** The DTS changed how the TGA is reported twice; each account type is only valid inside its own period. */
    private static final LocalDate CLOSING_FROM = LocalDate.of(2022, 4, 18);
    private static final LocalDate TGA_FROM = LocalDate.of(2021, 10, 1);

    private final LiquidityHttp http;

    public TreasuryClient(LiquidityHttp http) {
        this.http = http;
    }

    @Override
    public LiquiditySource source() {
        return LiquiditySource.TREASURY;
    }

    @Override
    public Map<String, List<SeriesPoint>> fetch(LocalDate from, LocalDate to) {
        return fetch(from, to, SyncProgress.NONE);
    }

    @Override
    public Map<String, List<SeriesPoint>> fetch(LocalDate from, LocalDate to, SyncProgress progress) {
        SeriesParsing.Collector all = new SeriesParsing.Collector();
        int totalPages = 1;
        for (int page = 1; page <= totalPages && page <= MAX_PAGES; page++) {
            progress.onStep(page, totalPages, "page " + page);
            JsonNode root = http.getJson(uri(from, to, page));
            all.putAll(parse(root));
            totalPages = root.path("meta").path("total-pages").asInt(1);
        }
        return all.build();
    }

    private static URI uri(LocalDate from, LocalDate to, int page) {
        return URI.create(ENDPOINT
                + "?filter=record_date:gte:" + from + ",record_date:lte:" + to
                + "&fields=record_date,account_type,open_today_bal,close_today_bal"
                + "&page%5Bsize%5D=" + PAGE_SIZE + "&page%5Bnumber%5D=" + page
                + "&sort=record_date");
    }

    /** Values are strings in millions of dollars; the result is in billions. Account types are matched exactly. */
    public static Map<String, List<SeriesPoint>> parse(JsonNode root) {
        SeriesParsing.Collector out = new SeriesParsing.Collector();
        for (JsonNode row : root.path("data")) {
            LocalDate date = SeriesParsing.date(row.get("record_date"));
            if (date == null) continue;
            String type = row.path("account_type").asText("");
            Double millions = null;
            if (type.equals(TYPE_CLOSING) && !date.isBefore(CLOSING_FROM)) {
                millions = SeriesParsing.number(row.get("open_today_bal"));
            } else if (type.equals(TYPE_TGA) && !date.isBefore(TGA_FROM) && date.isBefore(CLOSING_FROM)) {
                millions = SeriesParsing.number(row.get("close_today_bal"));
            } else if (type.equals(TYPE_FED) && date.isBefore(TGA_FROM)) {
                millions = SeriesParsing.number(row.get("close_today_bal"));
            }
            if (millions != null) out.put("TGA", date, millions / 1000.0);
        }
        return out.build();
    }
}
