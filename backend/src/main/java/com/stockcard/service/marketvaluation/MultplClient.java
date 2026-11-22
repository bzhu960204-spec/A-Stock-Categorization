package com.stockcard.service.marketvaluation;

import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** multpl.com: S&P 500 fundamentals and valuation tables, one HTML table of the full history per request (design §3.1.1, §4.1). */
@Component
public class MultplClient implements MvSourceClient {

    private static final String BASE = "https://www.multpl.com/";
    private static final ZoneId BEIJING = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US);
    private static final Pattern ROW = Pattern.compile("<tr[^>]*>\\s*<td[^>]*>(.*?)</td>\\s*<td[^>]*>(.*?)</td>", Pattern.DOTALL);
    private static final Pattern TAG = Pattern.compile("<[^>]*>");
    private static final Pattern ENTITY = Pattern.compile("&#?[A-Za-z0-9]+;");

    /** How a table dates its rows; the first row that breaks the convention is multpl's "today" estimate. */
    enum Convention {
        FIRST_OF_MONTH, MONTH_END, QUARTER_END;

        boolean matches(LocalDate d) {
            return switch (this) {
                case FIRST_OF_MONTH -> d.getDayOfMonth() == 1;
                case MONTH_END -> d.equals(d.withDayOfMonth(d.lengthOfMonth()));
                case QUARTER_END -> d.equals(d.withDayOfMonth(d.lengthOfMonth())) && d.getMonthValue() % 3 == 0;
            };
        }
    }

    /** One table: the series it feeds, where it lives, and the sanity range that keeps layout changes from writing garbage. */
    record Spec(String code, String path, Convention convention, double min, double max, boolean hasSpot) {}

    static final List<Spec> SPECS = List.of(
            new Spec("SPX_CAPE", "shiller-pe/table/by-month", Convention.FIRST_OF_MONTH, 3, 100, true),
            new Spec("SPX_PE", "s-p-500-pe-ratio/table/by-month", Convention.FIRST_OF_MONTH, 3, 200, true),
            new Spec("SPX_DY", "s-p-500-dividend-yield/table/by-month", Convention.MONTH_END, 0, 20, true),
            new Spec("SPX_PB", "s-p-500-price-to-book/table/by-quarter", Convention.QUARTER_END, 0.3, 20, true),
            new Spec("SPX_PS", "s-p-500-price-to-sales/table/by-quarter", Convention.QUARTER_END, 0.2, 20, true),
            new Spec("SPX_EPS", "s-p-500-earnings/table/by-month", Convention.MONTH_END, Double.MIN_VALUE, Double.MAX_VALUE, false),
            new Spec("SPX_SPS", "s-p-500-sales/table/by-quarter", Convention.QUARTER_END, Double.MIN_VALUE, Double.MAX_VALUE, false),
            new Spec("SPX_BVPS", "s-p-500-book-value/table/by-quarter", Convention.QUARTER_END, Double.MIN_VALUE, Double.MAX_VALUE, false));

    private final MvHttp http;

    public MultplClient(MvHttp http) {
        this.http = http;
    }

    @Override
    public MvSource source() {
        return MvSource.MULTPL;
    }

    @Override
    public Map<String, List<MvPoint>> fetch(LocalDate from, LocalDate to, FetchMode mode) {
        return fetchDetailed(from, to, mode, SyncProgress.NONE).points();
    }

    /** Every request returns the full history, so {@code from} / {@code mode} do not matter (upserts are idempotent). */
    @Override
    public MvFetchResult fetchDetailed(LocalDate from, LocalDate to, FetchMode mode, SyncProgress progress) {
        LocalDate today = LocalDate.now(BEIJING);
        Map<String, List<MvPoint>> out = new LinkedHashMap<>();
        List<String> warnings = new ArrayList<>();
        for (int i = 0; i < SPECS.size(); i++) {
            Spec spec = SPECS.get(i);
            progress.onStep(i + 1, SPECS.size(), spec.code());
            try {
                out.putAll(parse(http.getText(URI.create(BASE + spec.path())), spec, today));
            } catch (RuntimeException e) {
                warnings.add(spec.code() + ": " + MvHttp.redact(e.getMessage()));
            }
        }
        if (out.isEmpty()) throw new IllegalStateException("multpl 全部表格失败：" + String.join("；", warnings));
        return new MvFetchResult(out, warnings);
    }

    /**
     * Parses one table. Rows dated after {@code today} are dropped; the first row, when it breaks the table's date convention, is
     * today's estimate and goes to {@code <code>_SPOT}. A page without a single usable row is a failure (the layout has changed).
     */
    static Map<String, List<MvPoint>> parse(String html, Spec spec, LocalDate today) {
        List<MvPoint> regular = new ArrayList<>();
        List<MvPoint> spot = new ArrayList<>();
        boolean first = true;
        Matcher m = ROW.matcher(html);
        while (m.find()) {
            boolean isFirst = first;
            first = false;
            LocalDate date = parseDate(m.group(1));
            if (date == null || date.isAfter(today)) continue;
            String cell = m.group(2);
            Double value = parseValue(cell);
            if (value == null || value < spec.min() || value > spec.max()) continue;
            boolean estimate = isEstimate(m.group(1)) || isEstimate(cell);
            if (isFirst && spec.hasSpot() && !spec.convention().matches(date)) {
                spot.add(new MvPoint(date, value, true));
            } else {
                regular.add(new MvPoint(date, value, estimate));
            }
        }
        if (regular.isEmpty() && spot.isEmpty()) {
            throw new IllegalStateException("页面结构可能已变化：" + spec.path());
        }
        Map<String, List<MvPoint>> out = new LinkedHashMap<>();
        out.put(spec.code(), regular);
        if (!spot.isEmpty()) out.put(spec.code() + "_SPOT", spot);
        return out;
    }

    private static LocalDate parseDate(String cell) {
        try {
            return LocalDate.parse(stripMarkup(cell), DATE);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static Double parseValue(String cell) {
        String text = stripMarkup(cell).replace(",", "").replace("%", "").replace("†", "").trim();
        try {
            double v = Double.parseDouble(text);
            return Double.isFinite(v) ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static boolean isEstimate(String cell) {
        return cell.contains("Estimate") || cell.contains("†");
    }

    private static String stripMarkup(String cell) {
        return ENTITY.matcher(TAG.matcher(cell).replaceAll(" ")).replaceAll(" ")
                .replace('\u2002', ' ').replace('\u00A0', ' ').replace('†', ' ').trim();
    }
}
