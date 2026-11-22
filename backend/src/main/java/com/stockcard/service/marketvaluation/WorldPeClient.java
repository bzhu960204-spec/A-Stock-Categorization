package com.stockcard.service.marketvaluation;

import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** worldperatio.com: current PE and rolling 1/5/10/20-year mean and standard deviation per market (design §3.1.3, §4.3). */
@Component
public class WorldPeClient implements MvSourceClient {

    private static final String BASE = "https://worldperatio.com/";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.US);
    private static final Pattern SCRIPT = Pattern.compile("(?is)<script.*?</script>");
    private static final Pattern STYLE = Pattern.compile("(?is)<style.*?</style>");
    private static final Pattern TAG = Pattern.compile("<[^>]*>");
    private static final Pattern CURRENT = Pattern.compile("P/E\\) Ratio for (.+?) is ([0-9.]+) , calculated on (\\d{1,2} [A-Za-z]+ \\d{4})");
    private static final Pattern WINDOW = Pattern.compile(
            "(\\d+)Y Average: ([0-9.]+)\\W*1 Std Dev range: \\[([0-9.]+) , ([0-9.]+)\\]");
    private static final double MIN_PE = 1;
    private static final double MAX_PE = 200;

    private final MvHttp http;

    public WorldPeClient(MvHttp http) {
        this.http = http;
    }

    @Override
    public MvSource source() {
        return MvSource.WPR;
    }

    @Override
    public Map<String, List<MvPoint>> fetch(LocalDate from, LocalDate to, FetchMode mode) {
        return fetchDetailed(from, to, mode, SyncProgress.NONE).points();
    }

    /** The pages carry only "now", so the range is irrelevant; one market failing does not affect the others. */
    @Override
    public MvFetchResult fetchDetailed(LocalDate from, LocalDate to, FetchMode mode, SyncProgress progress) {
        Map<String, List<MvPoint>> out = new LinkedHashMap<>();
        List<String> warnings = new ArrayList<>();
        MvMarket[] markets = MvMarket.values();
        for (int i = 0; i < markets.length; i++) {
            progress.onStep(i + 1, markets.length, markets[i].name());
            try {
                out.putAll(parse(http.getText(URI.create(BASE + markets[i].path())), markets[i]));
            } catch (RuntimeException e) {
                warnings.add(markets[i].name() + ": " + MvHttp.redact(e.getMessage()));
            }
        }
        if (out.isEmpty()) throw new IllegalStateException("worldperatio 全部市场失败：" + String.join("；", warnings));
        return new MvFetchResult(out, warnings);
    }

    /** Parses one market page (raw HTML or already de-tagged text); throws when the current PE cannot be found. */
    static Map<String, List<MvPoint>> parse(String html, MvMarket market) {
        String text = toText(html);
        Matcher current = CURRENT.matcher(text);
        if (!current.find()) throw new IllegalStateException("页面结构可能已变化：" + market.path());
        double pe = Double.parseDouble(current.group(2));
        LocalDate date;
        try {
            date = LocalDate.parse(current.group(3), DATE);
        } catch (DateTimeParseException e) {
            throw new IllegalStateException("无法解析日期：" + current.group(3));
        }
        if (pe < MIN_PE || pe > MAX_PE) throw new IllegalStateException("PE 超出合理范围：" + pe);

        Map<String, List<MvPoint>> out = new LinkedHashMap<>();
        out.put(market.peCode(), List.of(new MvPoint(date, pe, false)));
        Set<Integer> seen = new HashSet<>();
        Matcher w = WINDOW.matcher(text);
        while (w.find()) {
            int years = Integer.parseInt(w.group(1));
            if (!isSupported(years) || !seen.add(years)) continue;
            double avg = Double.parseDouble(w.group(2));
            double sd = Double.parseDouble(w.group(4)) - avg;
            if (avg < MIN_PE || avg > MAX_PE || !(sd > 0)) continue;
            out.put(market.avgCode(years), List.of(new MvPoint(date, avg, false)));
            out.put(market.sdCode(years), List.of(new MvPoint(date, sd, false)));
        }
        return out;
    }

    private static boolean isSupported(int years) {
        for (int y : MvMarket.YEARS) if (y == years) return true;
        return false;
    }

    private static String toText(String html) {
        String s = STYLE.matcher(SCRIPT.matcher(html).replaceAll(" ")).replaceAll(" ");
        s = TAG.matcher(s).replaceAll(" ").replace("&#038;", "&").replace("&amp;", "&")
                .replace("&middot;", "·").replace("&#183;", "·").replace("&#xB7;", "·").replace("&#xb7;", "·").replace('\u00A0', ' ');
        return s.replaceAll("\\s+", " ").trim();
    }
}
