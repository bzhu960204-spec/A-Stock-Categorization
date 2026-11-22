package com.stockcard.service.marketvaluation;

import com.stockcard.service.liquidity.SeriesPoint;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/** Splits the S&P 500 return over 1/3/5/10 years into earnings growth and valuation expansion (design §3.5). */
@Service
public class MvDecompositionService {

    /** All values in percent. */
    public record Part(double total, double valuation, double earnings) {}

    /** {@code forward} is null when FactSet history does not reach back to the start date. */
    public record Row(String horizon, LocalDate startDate, LocalDate endDate, Part ttm, Part cape, Part forward) {}

    private static final int[] HORIZONS = {1, 3, 5, 10};
    private static final int MAX_GAP_DAYS = 10;
    private static final int FORWARD_GAP_DAYS = 14;

    private final MvCalcService calc;
    private final Clock clock;

    @Autowired
    public MvDecompositionService(MvCalcService calc) {
        this(calc, Clock.system(ZoneId.of("Asia/Shanghai")));
    }

    MvDecompositionService(MvCalcService calc, Clock clock) {
        this.calc = calc;
        this.clock = clock;
    }

    /**
     * With total = ln(P_t / P_s) and valuation = ln(M_t / M_s) for a multiple M, the earnings part is the remainder,
     * ln(E_t / E_s) for E = P / M, so the two always add up exactly in log terms. Results are converted to percent via exp(x) - 1.
     */
    static Part decompose(double priceNow, double priceThen, double multipleNow, double multipleThen) {
        double total = Math.log(priceNow / priceThen);
        double valuation = Math.log(multipleNow / multipleThen);
        return new Part(pct(total), pct(valuation), pct(total - valuation));
    }

    private static double pct(double logValue) {
        return (Math.exp(logValue) - 1) * 100;
    }

    public List<Row> decomposition() {
        LocalDate today = LocalDate.now(clock);
        LocalDate from = today.minusYears(11);
        MvCalcService.Session session = calc.session();
        List<SeriesPoint> px = session.get("PX_SPX", from);
        SeriesPoint latest = MvCalcService.last(px);
        List<Row> rows = new ArrayList<>();
        if (latest == null) return rows;

        List<SeriesPoint> pe = session.get("SPX_PE_D", from);
        List<SeriesPoint> cape = session.get("SPX_CAPE_D", from);
        List<SeriesPoint> forward = session.get("FS_FWD_PE", from);
        for (int years : HORIZONS) {
            SeriesPoint start = MvCalcService.asOf(px, latest.date().minusYears(years), MAX_GAP_DAYS);
            if (start == null) continue;
            Part ttm = part(latest, start, pe, MAX_GAP_DAYS);
            Part capeBased = part(latest, start, cape, MAX_GAP_DAYS);
            Part forwardBased = part(latest, start, forward, FORWARD_GAP_DAYS);
            if (ttm == null && capeBased == null && forwardBased == null) continue;
            rows.add(new Row(years + "Y", start.date(), latest.date(), ttm, capeBased, forwardBased));
        }
        return rows;
    }

    private static Part part(SeriesPoint now, SeriesPoint then, List<SeriesPoint> multiple, int maxGapDays) {
        SeriesPoint mNow = MvCalcService.asOf(multiple, now.date(), maxGapDays);
        SeriesPoint mThen = MvCalcService.asOf(multiple, then.date(), maxGapDays);
        if (mNow == null || mThen == null || !(mNow.value() > 0) || !(mThen.value() > 0)) return null;
        return decompose(now.value(), then.value(), mNow.value(), mThen.value());
    }
}
