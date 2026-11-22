package com.stockcard.service.marketvaluation;

import com.stockcard.service.liquidity.SeriesPoint;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The multi-market PE table (design §3.2.5, §5.7 /markets) and the PB-ROE scatter (§5.7 /scatter/pb-roe). */
@Service
public class MvMarketService {

    public record WindowStat(Double avg, Double sd, Double z, String label) {}

    public record MarketRow(String market, String name, String scopeNote, LocalDate date, Double pe,
                            Map<String, WindowStat> windows, List<Object[]> history) {}

    public record ScatterPoint(LocalDate date, double roe, double pb, String era) {}

    private static final LocalDate FROM = LocalDate.of(1800, 1, 1);

    private final MvCalcService calc;

    public MvMarketService(MvCalcService calc) {
        this.calc = calc;
    }

    /** z-score wording shared with worldperatio. */
    public static String label(double z) {
        if (z > 2) return "昂贵";
        if (z > 1) return "高估";
        if (z >= -1) return "合理";
        if (z >= -2) return "低估";
        return "便宜";
    }

    public List<MarketRow> markets() {
        MvCalcService.Session session = calc.session();
        List<MarketRow> rows = new ArrayList<>();
        for (MvMarket m : MvMarket.values()) {
            List<SeriesPoint> pe = session.get(m.peCode(), FROM);
            SeriesPoint last = MvCalcService.last(pe);
            Map<String, WindowStat> windows = new LinkedHashMap<>();
            for (int years : MvMarket.YEARS) {
                SeriesPoint avg = last == null ? null : MvCalcService.asOf(session.get(m.avgCode(years), FROM), last.date());
                SeriesPoint sd = last == null ? null : MvCalcService.asOf(session.get(m.sdCode(years), FROM), last.date());
                Double z = last != null && avg != null && sd != null && sd.value() > 0 ? (last.value() - avg.value()) / sd.value() : null;
                windows.put(years + "Y", new WindowStat(avg == null ? null : avg.value(), sd == null ? null : sd.value(), z, z == null ? null : label(z)));
            }
            List<Object[]> history = new ArrayList<>(pe.size());
            for (SeriesPoint p : pe) history.add(new Object[]{p.date().toString(), p.value()});
            rows.add(new MarketRow(m.name(), m.label(), m.scopeNote(), last == null ? null : last.date(), last == null ? null : last.value(), windows, history));
        }
        return rows;
    }

    static String era(LocalDate date) {
        if (date.getYear() <= 2008) return "2000-2008";
        return date.getYear() <= 2019 ? "2009-2019" : "2020+";
    }

    /** Quarter-ends where both ROE and PB exist, plus today's PB estimate against the latest ROE as the "LATEST" point. */
    public List<ScatterPoint> scatterPbRoe() {
        MvCalcService.Session session = calc.session();
        List<SeriesPoint> roe = session.get("SPX_ROE", FROM);
        List<SeriesPoint> pb = session.get("SPX_PB", FROM);
        Map<LocalDate, Double> pbByDate = new LinkedHashMap<>();
        pb.forEach(p -> pbByDate.put(p.date(), p.value()));

        List<ScatterPoint> out = new ArrayList<>();
        for (SeriesPoint r : roe) {
            Double p = pbByDate.get(r.date());
            if (p != null) out.add(new ScatterPoint(r.date(), r.value(), p, era(r.date())));
        }
        SeriesPoint latestRoe = MvCalcService.last(roe);
        SeriesPoint latestPb = MvCalcService.last(session.get("SPX_PB_D", LocalDate.now().minusDays(400)));
        if (latestRoe != null && latestPb != null) out.add(new ScatterPoint(latestPb.date(), latestRoe.value(), latestPb.value(), "LATEST"));
        return out;
    }
}
