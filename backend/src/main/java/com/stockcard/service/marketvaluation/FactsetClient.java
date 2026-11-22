package com.stockcard.service.marketvaluation;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * FactSet Earnings Insight: a weekly PDF with forward P/E, growth and revision data (design §3.1.4, §4.4). The client only downloads
 * and parses the weeks it is given; the bookkeeping of which weeks are done lives in {@link MvSyncService}.
 */
@Component
public class FactsetClient {

    private static final String BASE = "https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/";
    private static final DateTimeFormatter FILE_DATE = DateTimeFormatter.ofPattern("MMddyy");
    private static final int MAX_PAGES = 30;

    /** Outcome of one week: the file found (or not), how it parsed, and the observations to store. */
    public record WeekResult(LocalDate weekFriday, String status, LocalDate reportDate, String fileName, String fiscalQuarter,
                             String message, Map<String, Double> values) {}

    /** {@code ok} is false when the mandatory forward P/E triple could not be read; {@code missing} lists absent optional fields. */
    public record FactsetParse(boolean ok, Map<String, Double> values, String fiscalQuarter, List<String> missing, Double targetUpsidePct) {}

    private static final Pattern FWD_PE = Pattern.compile(
            "forward 12-month P/E ratio for the S&P 500 is (\\d+\\.\\d)\\.?[^()]*?5-year average \\((\\d+\\.\\d)\\)[^()]*?10-year average \\((\\d+\\.\\d)\\)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TTM_PE = Pattern.compile("trailing 12-month P/E ratio is (\\d+\\.\\d)", Pattern.CASE_INSENSITIVE);
    private static final Pattern EPS_GROWTH = Pattern.compile(
            "For (Q[1-4] \\d{4}), the blended (?:\\(year-over-year\\) )?earnings (growth rate|decline) for the S&P 500 is (-?\\d+\\.\\d)%",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern REV_GROWTH = Pattern.compile(
            "blended revenue (growth rate|decline) for (?:the )?(?:Q[1-4](?: \\d{4})?|(?:first|second|third|fourth) quarter) is (-?\\d+\\.\\d)%",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern BEAT = Pattern.compile(
            "(\\d{1,3})% of (?:the )?S&P 500 companies (?:have )?reported (?:a )?positive EPS surprises?", Pattern.CASE_INSENSITIVE);
    private static final Pattern NEXT_YEAR = Pattern.compile(
            "For CY ?(\\d{4}), analysts are projecting earnings growth of (-?\\d+\\.\\d)% and revenue growth of (-?\\d+\\.\\d)%",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TARGET = Pattern.compile(
            "bottom-up target price for the S&P 500 is ([\\d,]+\\.\\d+), which is (-?\\d+\\.\\d)% (above|below) the closing price of ([\\d,]+\\.\\d+)",
            Pattern.CASE_INSENSITIVE);

    private final MvHttp http;

    public FactsetClient(MvHttp http) {
        this.http = http;
    }

    /** Candidate file names for the week of Friday {@code friday}, in probing order: Friday, Friday + "A", Thursday, Thursday + "A". */
    static List<String> candidateFileNames(LocalDate friday) {
        LocalDate thursday = friday.minusDays(1);
        String f = FILE_DATE.format(friday);
        String t = FILE_DATE.format(thursday);
        return List.of("EarningsInsight_" + f + ".pdf", "EarningsInsight_" + f + "A.pdf",
                "EarningsInsight_" + t + ".pdf", "EarningsInsight_" + t + "A.pdf");
    }

    /** The date a candidate file name carries (MMddyy). */
    static LocalDate dateOf(String fileName) {
        return LocalDate.parse(fileName.substring("EarningsInsight_".length(), "EarningsInsight_".length() + 6), FILE_DATE);
    }

    /** Fridays from {@code from} up to and including {@code to}, newest first. */
    public static List<LocalDate> fridaysBetween(LocalDate from, LocalDate to) {
        List<LocalDate> out = new ArrayList<>();
        LocalDate d = to;
        while (d.getDayOfWeek() != DayOfWeek.FRIDAY) d = d.minusDays(1);
        for (; !d.isBefore(from); d = d.minusWeeks(1)) out.add(d);
        return out;
    }

    /**
     * Downloads and parses each week in order, handing every result to {@code sink} as soon as it is ready so that a failure
     * halfway keeps what was already done. A network error (not a 404) propagates and aborts the run.
     */
    public void fetchWeeks(List<LocalDate> weeks, MvSourceClient.SyncProgress progress, Consumer<WeekResult> sink) {
        for (int i = 0; i < weeks.size(); i++) {
            LocalDate friday = weeks.get(i);
            progress.onStep(i + 1, weeks.size(), friday.toString());
            sink.accept(fetchWeek(friday));
        }
    }

    static URI uriOf(String fileName) {
        return URI.create(BASE + fileName);
    }

    WeekResult fetchWeek(LocalDate friday) {
        for (String name : candidateFileNames(friday)) {
            byte[] pdf = http.getBytesOrNull(uriOf(name));
            if (pdf == null) continue;
            LocalDate reportDate = dateOf(name);
            String text;
            try {
                text = extractText(pdf);
            } catch (IOException | RuntimeException e) {
                return new WeekResult(friday, "PARSE_FAILED", reportDate, name, null, "PDF 文本提取失败：" + e.getMessage(), Map.of());
            }
            FactsetParse parsed = parseText(text, reportDate);
            if (!parsed.ok()) {
                return new WeekResult(friday, "PARSE_FAILED", reportDate, name, null, "未找到远期 PE 句式", Map.of());
            }
            String message = parsed.missing().isEmpty() ? null : "missing: " + String.join(",", parsed.missing());
            return new WeekResult(friday, "PARSED", reportDate, name, parsed.fiscalQuarter(), message, parsed.values());
        }
        return new WeekResult(friday, "NOT_FOUND", null, null, null, null, Map.of());
    }

    /** First pages only; the key figures are all up front. */
    public static String extractText(byte[] pdf) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(1);
            stripper.setEndPage(Math.min(MAX_PAGES, Math.max(1, doc.getNumberOfPages())));
            return stripper.getText(doc);
        }
    }

    static String normalize(String text) {
        return text.replace('\uF0B7', ' ').replace('•', ' ').replace('\uFFFD', ' ').replace('’', '\'')
                .replace('\u00A0', ' ').replaceAll("\\s+", " ").trim();
    }

    /** Extracts every figure of design §3.1.4; only the forward P/E triple is mandatory. */
    public static FactsetParse parseText(String rawText, LocalDate reportDate) {
        String text = normalize(rawText);
        Map<String, Double> values = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        String quarter = null;
        Double targetUpside = null;

        Matcher fwd = FWD_PE.matcher(text);
        if (!fwd.find()) return new FactsetParse(false, Map.of(), null, List.of(), null);
        values.put("FS_FWD_PE", num(fwd.group(1)));
        values.put("FS_FWD_PE_AVG5Y", num(fwd.group(2)));
        values.put("FS_FWD_PE_AVG10Y", num(fwd.group(3)));

        Matcher ttm = TTM_PE.matcher(text);
        if (ttm.find()) values.put("FS_TTM_PE", num(ttm.group(1))); else missing.add("FS_TTM_PE");

        Matcher eps = EPS_GROWTH.matcher(text);
        if (eps.find()) {
            quarter = eps.group(1).toUpperCase();
            values.put("FS_EPS_G_Q", signed(eps.group(2), num(eps.group(3))));
        } else {
            missing.add("FS_EPS_G_Q");
        }

        Matcher rev = REV_GROWTH.matcher(text);
        if (rev.find()) values.put("FS_REV_G_Q", signed(rev.group(1), num(rev.group(2)))); else missing.add("FS_REV_G_Q");

        Matcher beat = BEAT.matcher(text);
        if (beat.find()) values.put("FS_BEAT_EPS", num(beat.group(1))); else missing.add("FS_BEAT_EPS");

        boolean nextYear = false;
        Matcher ny = NEXT_YEAR.matcher(text);
        while (ny.find()) {
            if (Integer.parseInt(ny.group(1)) == reportDate.getYear() + 1) {
                values.put("FS_EPS_G_NY", num(ny.group(2)));
                values.put("FS_REV_G_NY", num(ny.group(3)));
                nextYear = true;
                break;
            }
        }
        if (!nextYear) {
            missing.add("FS_EPS_G_NY");
            missing.add("FS_REV_G_NY");
        }

        Matcher target = TARGET.matcher(text);
        if (target.find()) {
            values.put("FS_TARGET", num(target.group(1)));
            values.put("FS_CLOSE", num(target.group(4)));
            double pct = num(target.group(2));
            targetUpside = "below".equalsIgnoreCase(target.group(3)) ? -Math.abs(pct) : Math.abs(pct);
        } else {
            missing.add("FS_TARGET");
            missing.add("FS_CLOSE");
        }
        return new FactsetParse(true, values, quarter, missing, targetUpside);
    }

    /** "decline" with a positive number means a drop; the real reports already print the minus sign, which must not be negated twice. */
    private static double signed(String wording, double value) {
        return wording.equalsIgnoreCase("decline") && value > 0 ? -value : value;
    }

    private static double num(String s) {
        return Double.parseDouble(s.replace(",", ""));
    }
}
