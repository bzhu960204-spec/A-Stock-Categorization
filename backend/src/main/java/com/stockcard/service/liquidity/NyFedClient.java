package com.stockcard.service.liquidity;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.UnaryOperator;

/** NY Fed Markets API: reference rates, repo operations, Treasury / MBS purchase operations and SOMA holdings (design §4.1; qe-radar §4.1). */
@Component
public class NyFedClient implements LiquiditySourceClient {

    private static final String BASE = "https://markets.newyorkfed.org/api";
    private static final String[] RATE_PATHS = {
            "/rates/secured/sofr", "/rates/secured/tgcr", "/rates/secured/bgcr", "/rates/unsecured/effr"
    };
    private static final double BILLION = 1e9;
    /** The Desk's routine test operations are 0.025–0.075 bn; real programmes are far larger. */
    static final double SMALL_VALUE_MAX_BN = 0.5;
    private static final double EPSILON = 1e-9;
    private static final String AGENCY_OPS = "AGENCY_OPS_NET";

    private final LiquidityHttp http;

    public NyFedClient(LiquidityHttp http) {
        this.http = http;
    }

    @Override
    public LiquiditySource source() {
        return LiquiditySource.NYFED;
    }

    @Override
    public Map<String, List<SeriesPoint>> fetch(LocalDate from, LocalDate to) {
        return fetch(from, to, SyncProgress.NONE);
    }

    @Override
    public Map<String, List<SeriesPoint>> fetch(LocalDate from, LocalDate to, SyncProgress progress) {
        SeriesParsing.Collector all = new SeriesParsing.Collector();
        List<LocalDate[]> rateChunks = chunks(from, to, 3);
        List<LocalDate[]> yearChunks = calendarYearChunks(from, to);
        int total = rateChunks.size() * RATE_PATHS.length + yearChunks.size() * 3 + 1;
        int step = 0;
        for (LocalDate[] chunk : rateChunks) {
            for (String path : RATE_PATHS) {
                progress.onStep(++step, total, path.substring(path.lastIndexOf('/') + 1) + " " + chunk[0]);
                all.putAll(parseRates(http.getJson(searchUri(path, chunk))));
            }
        }
        // MBS and Agency Debt operations can fall on the same day and come from two endpoints: their net amounts add up.
        Map<LocalDate, Double> agencyOps = new TreeMap<>();
        for (LocalDate[] chunk : yearChunks) {
            progress.onStep(++step, total, "repo " + chunk[0].getYear());
            all.putAll(parseRepo(http.getJson(searchUri("/rp/results", chunk))));
            progress.onStep(++step, total, "treasury " + chunk[0].getYear());
            Map<String, List<SeriesPoint>> treasury = parseTreasuryPurchases(http.getJson(searchUri("/tsy/all/results/summary", chunk)));
            addSums(agencyOps, treasury.remove(AGENCY_OPS));
            all.putAll(treasury);
            progress.onStep(++step, total, "mbs " + chunk[0].getYear());
            addSums(agencyOps, parseMbsOperations(http.getJson(searchUri("/ambs/all/results/summary", chunk))).get(AGENCY_OPS));
        }
        agencyOps.forEach((d, v) -> all.put(AGENCY_OPS, d, v));
        // The SOMA summary is one response with the whole history and cannot be filtered by date.
        progress.onStep(++step, total, "soma");        parseSoma(http.getJson(URI.create(BASE + "/soma/summary.json"))).forEach((code, points) -> points.stream()
                .filter(p -> !p.date().isBefore(from) && !p.date().isAfter(to))
                .forEach(p -> all.put(code, p.date(), p.value())));
        return all.build();
    }

    private static void addSums(Map<LocalDate, Double> target, List<SeriesPoint> points) {
        if (points != null) points.forEach(p -> target.merge(p.date(), p.value(), Double::sum));
    }

    private static URI searchUri(String path, LocalDate[] range) {
        return URI.create(BASE + path + "/search.json?startDate=" + range[0] + "&endDate=" + range[1]);
    }

    /** Consecutive windows of {@code years} years: [from, from+years-1d], ... clipped to {@code to}. */
    static List<LocalDate[]> chunks(LocalDate from, LocalDate to, int years) {
        return windows(from, to, start -> start.plusYears(years).minusDays(1));
    }

    /** One window per calendar year (the first and last may be partial). */
    static List<LocalDate[]> calendarYearChunks(LocalDate from, LocalDate to) {
        return windows(from, to, start -> LocalDate.of(start.getYear(), 12, 31));
    }

    private static List<LocalDate[]> windows(LocalDate from, LocalDate to, UnaryOperator<LocalDate> endOf) {
        List<LocalDate[]> out = new ArrayList<>();
        for (LocalDate start = from; !start.isAfter(to); ) {
            LocalDate end = endOf.apply(start);
            if (end.isAfter(to)) end = to;
            out.add(new LocalDate[]{start, end});
            start = end.plusDays(1);
        }
        return out;
    }

    // ---- parsing ----

    /** Parses a {@code refRates[]} response (any mix of SOFR / TGCR / BGCR / EFFR records). Missing fields are skipped. */
    public static Map<String, List<SeriesPoint>> parseRates(JsonNode root) {
        SeriesParsing.Collector out = new SeriesParsing.Collector();
        for (JsonNode r : root.path("refRates")) {
            LocalDate date = SeriesParsing.date(r.get("effectiveDate"));
            String type = r.path("type").asText("");
            switch (type) {
                case "SOFR" -> {
                    out.put("SOFR", date, SeriesParsing.number(r.get("percentRate")));
                    out.put("SOFR_P1", date, SeriesParsing.number(r.get("percentPercentile1")));
                    out.put("SOFR_P25", date, SeriesParsing.number(r.get("percentPercentile25")));
                    out.put("SOFR_P75", date, SeriesParsing.number(r.get("percentPercentile75")));
                    out.put("SOFR_P99", date, SeriesParsing.number(r.get("percentPercentile99")));
                    out.put("SOFR_VOL", date, SeriesParsing.number(r.get("volumeInBillions")));
                }
                case "TGCR" -> {
                    out.put("TGCR", date, SeriesParsing.number(r.get("percentRate")));
                    out.put("TGCR_P99", date, SeriesParsing.number(r.get("percentPercentile99")));
                    out.put("TGCR_VOL", date, SeriesParsing.number(r.get("volumeInBillions")));
                }
                case "BGCR" -> out.put("BGCR", date, SeriesParsing.number(r.get("percentRate")));
                case "EFFR" -> {
                    out.put("EFFR", date, SeriesParsing.number(r.get("percentRate")));
                    out.put("EFFR_VOL", date, SeriesParsing.number(r.get("volumeInBillions")));
                    out.put("FFTR_LOW", date, SeriesParsing.number(r.get("targetRateFrom")));
                    out.put("FFTR_HIGH", date, SeriesParsing.number(r.get("targetRateTo")));
                }
                default -> { }
            }
        }
        return out.build();
    }

    /**
     * Parses {@code repo.operations[]}, which mixes Repo (the standing repo facility) and Reverse Repo (ON RRP).
     * Amounts are summed per operation date; the SRF minimum bid rate is only written on days that have one.
     */
    public static Map<String, List<SeriesPoint>> parseRepo(JsonNode root) {
        Map<LocalDate, Double> rrpAmt = new TreeMap<>();
        Map<LocalDate, Double> rrpRate = new TreeMap<>();
        Map<LocalDate, Double> srfAmt = new TreeMap<>();
        Map<LocalDate, Double> srfRate = new TreeMap<>();

        for (JsonNode op : root.path("repo").path("operations")) {
            if (!isFinal(op)) continue;
            LocalDate date = SeriesParsing.date(op.get("operationDate"));
            if (date == null) continue;
            Double amount = SeriesParsing.number(op.get("totalAmtAccepted"));
            String type = op.path("operationType").asText("");
            if (type.equals("Reverse Repo")) {
                if (amount != null) rrpAmt.merge(date, amount / BILLION, Double::sum);
                for (JsonNode d : op.path("details")) {
                    Double rate = SeriesParsing.number(d.get("percentAwardRate"));
                    if (rate != null) {
                        rrpRate.putIfAbsent(date, rate);
                        break;
                    }
                }
            } else if (type.equals("Repo")) {
                if (amount != null) srfAmt.merge(date, amount / BILLION, Double::sum);
                for (JsonNode d : op.path("details")) {
                    Double rate = SeriesParsing.number(d.get("percentOfferingRate"));
                    if (rate != null) srfRate.merge(date, rate, Math::min);
                }
            }
        }

        SeriesParsing.Collector out = new SeriesParsing.Collector();
        rrpAmt.forEach((d, v) -> out.put("ONRRP_AMT", d, v));
        rrpRate.forEach((d, v) -> out.put("ONRRP_RATE", d, v));
        srfAmt.forEach((d, v) -> out.put("SRF_AMT", d, v));
        srfRate.forEach((d, v) -> out.put("SRF_RATE", d, v));
        return out.build();
    }

    /**
     * Parses {@code treasury.auctions[]}. Bills bought (direction "P") are RMP_BILLS; Coupon / TIPS / FRN purchases minus sales are
     * COUPON_OPS_NET; the 2009 "Outright Agency Debt Purchase" is AGENCY_OPS_NET. Operations under {@link #SMALL_VALUE_MAX_BN}
     * are the Desk's routine tests and are ignored, as are days that net out to zero.
     */
    public static Map<String, List<SeriesPoint>> parseTreasuryPurchases(JsonNode root) {
        Map<LocalDate, Double> bills = new TreeMap<>();
        Map<LocalDate, Double> coupons = new TreeMap<>();
        Map<LocalDate, Double> agency = new TreeMap<>();
        for (JsonNode op : root.path("treasury").path("auctions")) {
            if (!isFinal(op)) continue;
            LocalDate date = SeriesParsing.date(op.get("operationDate"));
            Double amount = SeriesParsing.number(op.get("totalParAmtAccepted"));
            if (date == null || amount == null) continue;
            String direction = op.path("operationDirection").asText();
            String type = op.path("operationType").asText("").toLowerCase();

            if ("P".equals(direction) && type.contains("bill")) {
                bills.merge(date, amount / BILLION, Double::sum);
            } else if (type.contains("coupon") || type.contains("tips") || type.contains("frn")) {
                double bn = amount / BILLION;
                if (bn >= SMALL_VALUE_MAX_BN) coupons.merge(date, signed(direction, bn), Double::sum);
            } else if (type.equals("outright agency debt purchase")) {
                double bn = amount / BILLION;
                if (bn >= SMALL_VALUE_MAX_BN) agency.merge(date, bn, Double::sum);
            }
        }
        SeriesParsing.Collector out = new SeriesParsing.Collector();
        bills.forEach((d, v) -> out.put("RMP_BILLS", d, v));
        coupons.forEach((d, v) -> { if (Math.abs(v) > EPSILON) out.put("COUPON_OPS_NET", d, v); });
        agency.forEach((d, v) -> { if (Math.abs(v) > EPSILON) out.put(AGENCY_OPS, d, v); });
        return out.build();
    }

    /**
     * Parses {@code ambs.auctions[]}. Only {@code Outright*} operations change the holdings: purchases count positive, sales negative.
     * Dollar Rolls and Coupon Swaps are ignored, as are blank amounts and sub-{@link #SMALL_VALUE_MAX_BN} tests.
     */
    public static Map<String, List<SeriesPoint>> parseMbsOperations(JsonNode root) {
        Map<LocalDate, Double> net = new TreeMap<>();
        for (JsonNode op : root.path("ambs").path("auctions")) {
            if (!isFinal(op)) continue;
            String type = op.path("operationType").asText("");
            if (!type.startsWith("Outright")) continue;
            LocalDate date = SeriesParsing.date(op.get("operationDate"));
            Double amount = SeriesParsing.number(op.get("totalAmtAcceptedPar"));
            if (date == null || amount == null) continue;
            double bn = amount / BILLION;
            if (bn < SMALL_VALUE_MAX_BN) continue;
            String direction = op.path("operationDirection").asText("");
            if (type.endsWith("Sale") || direction.equals("S")) {
                net.merge(date, -bn, Double::sum);
            } else if (type.endsWith("Purchase") || direction.equals("P")) {
                net.merge(date, bn, Double::sum);
            }
        }
        SeriesParsing.Collector out = new SeriesParsing.Collector();
        net.forEach((d, v) -> { if (Math.abs(v) > EPSILON) out.put(AGENCY_OPS, d, v); });
        return out.build();
    }

    private static double signed(String direction, double bn) {
        return "S".equals(direction) ? -bn : bn;
    }

    /**
     * Parses {@code soma.summary[]}: amounts are dollar strings (blank = 0). Stored in bn as the total, the bills, and the other two
     * groups so that {@code SOMA_BILLS + SOMA_COUPONS + SOMA_MBS = SOMA_TOTAL}; inflation compensation is not part of the total.
     * The as-of date is normally a Wednesday but a Tuesday after a Monday holiday, so it is stored as given.
     */
    public static Map<String, List<SeriesPoint>> parseSoma(JsonNode root) {
        SeriesParsing.Collector out = new SeriesParsing.Collector();
        for (JsonNode r : root.path("soma").path("summary")) {
            LocalDate date = SeriesParsing.date(r.get("asOfDate"));
            Double total = SeriesParsing.number(r.get("total"));
            if (date == null || total == null) continue;
            out.put("SOMA_TOTAL", date, total / BILLION);
            out.put("SOMA_BILLS", date, amount(r, "bills") / BILLION);
            out.put("SOMA_COUPONS", date, (amount(r, "notesbonds") + amount(r, "tips") + amount(r, "frn")) / BILLION);
            out.put("SOMA_MBS", date, (amount(r, "mbs") + amount(r, "cmbs") + amount(r, "agencies")) / BILLION);
        }
        return out.build();
    }

    private static double amount(JsonNode node, String field) {
        Double v = SeriesParsing.number(node.get(field));
        return v == null ? 0 : v;
    }

    /** Announced-but-not-yet-settled operations have a status other than "Results" and no final amounts. */
    private static boolean isFinal(JsonNode op) {
        JsonNode status = op.get("auctionStatus");
        return status == null || status.isNull() || status.asText().equals("Results");
    }
}
