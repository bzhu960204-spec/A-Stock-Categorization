package com.stockcard.service.marketvaluation;

import com.stockcard.entity.MvObservation;
import com.stockcard.repository.MvManualSeriesRepository;
import com.stockcard.repository.MvObservationRepository;
import com.stockcard.service.liquidity.SeriesPoint;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static com.stockcard.service.marketvaluation.MvFixtures.pt;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MvStatsServiceTest {

    private static List<SeriesPoint> series(double... values) {
        List<SeriesPoint> out = new ArrayList<>();
        for (int i = 0; i < values.length; i++) out.add(new SeriesPoint(LocalDate.of(2000, 1, 1).plusMonths(i), values[i]));
        return out;
    }

    @Test
    void percentileIsBelowPlusHalfEqualOverN() {
        assertThat(MvStatsService.percentile(series(1, 2, 3, 4), 3)).isCloseTo(62.5, within(1e-9));
        assertThat(MvStatsService.percentile(series(1, 2, 3, 4), 10)).isCloseTo(100.0, within(1e-9));
        assertThat(MvStatsService.percentile(series(1, 2, 3, 4), 0)).isCloseTo(0.0, within(1e-9));
        assertThat(MvStatsService.percentile(List.of(), 1)).isNull();
    }

    @Test
    void windowStatsCutTheSampleAndReportItsStart() {
        List<SeriesPoint> base = new ArrayList<>();
        for (int y = 2000; y <= 2026; y++) base.add(pt(y + "-06-30", y - 2000));

        MvStatsService.Stats ten = MvStatsService.windowStats(base, LocalDate.of(2026, 6, 30), MvStatsService.Window.Y10);
        MvStatsService.Stats all = MvStatsService.windowStats(base, LocalDate.of(2026, 6, 30), MvStatsService.Window.ALL);
        MvStatsService.Stats since1990 = MvStatsService.windowStats(base, LocalDate.of(2026, 6, 30), MvStatsService.Window.SINCE_1990);

        assertThat(ten.n()).isEqualTo(11);
        assertThat(ten.sampleStart()).isEqualTo(LocalDate.of(2016, 6, 30));
        assertThat(ten.mean()).isCloseTo(21.0, within(1e-9));
        assertThat(ten.p50()).isCloseTo(21.0, within(1e-9));
        assertThat(all.n()).isEqualTo(27);
        assertThat(since1990.n()).isEqualTo(27);
        assertThat(MvStatsService.windowStats(base, LocalDate.of(1990, 1, 1), MvStatsService.Window.Y10)).isNull();
    }

    @Test
    void monthEndResampleKeepsTheLastObservationOfEachMonth() {
        List<SeriesPoint> daily = List.of(pt("2026-10-01", 1), pt("2026-10-30", 2), pt("2026-11-02", 3), pt("2026-11-20", 4));

        List<SeriesPoint> out = MvStatsService.resampleMonthEnd(daily);

        assertThat(out).containsExactly(pt("2026-10-31", 2), pt("2026-11-30", 4));
    }

    @Test
    void levelBoundariesBelongToTheHigherBand() {
        assertThat(MvStatsService.level(19.99)).isEqualTo("极便宜");
        assertThat(MvStatsService.level(20)).isEqualTo("偏便宜");
        assertThat(MvStatsService.level(40)).isEqualTo("中性");
        assertThat(MvStatsService.level(60)).isEqualTo("偏贵");
        assertThat(MvStatsService.level(80)).isEqualTo("昂贵");
        assertThat(MvStatsService.level(95)).isEqualTo("历史极端");
    }

    @Test
    void windowNamesAreParsed() {
        assertThat(MvStatsService.Window.parse(null)).isEqualTo(MvStatsService.Window.Y20);
        assertThat(MvStatsService.Window.parse("10Y")).isEqualTo(MvStatsService.Window.Y10);
        assertThat(MvStatsService.Window.parse("since_1990")).isEqualTo(MvStatsService.Window.SINCE_1990);
        assertThat(MvStatsService.Window.parse("ALL").wire()).isEqualTo("ALL");
    }

    private static MvCalcService calcWith(Map<String, List<SeriesPoint>> data) {
        MvObservationRepository obsRepo = mock(MvObservationRepository.class);
        when(obsRepo.findRange(anyString(), any(), any())).thenAnswer(inv -> {
            String code = inv.getArgument(0);
            LocalDate from = inv.getArgument(1);
            List<MvObservation> rows = new ArrayList<>();
            for (SeriesPoint p : data.getOrDefault(code, List.of())) {
                if (p.date().isBefore(from)) continue;
                MvObservation o = new MvObservation();
                o.setSeriesCode(code);
                o.setObsDate(p.date());
                o.setObsValue(p.value());
                rows.add(o);
            }
            return rows;
        });
        return new MvCalcService(obsRepo, mock(MvManualSeriesRepository.class));
    }

    @Test
    void temperatureAveragesUsableComponentsInvertsTheRiskPremiumAndExcludesTheRest() {
        // 59 weekly-then-monthly points: forward PE rises every month (today = highest), the real ERP falls every week (today = lowest).
        List<SeriesPoint> fwdPe = new ArrayList<>();
        List<SeriesPoint> prices = new ArrayList<>();
        List<SeriesPoint> tips = new ArrayList<>();
        List<SeriesPoint> cape = new ArrayList<>();
        LocalDate day = LocalDate.of(2022, 1, 3);
        int i = 0;
        for (; !day.isAfter(LocalDate.of(2026, 11, 16)); day = day.plusDays(7), i++) {
            prices.add(new SeriesPoint(day, 100));
            tips.add(new SeriesPoint(day, 0.01 * i));
            fwdPe.add(new SeriesPoint(day, 10 + 0.01 * i));
        }
        for (LocalDate m = LocalDate.of(2022, 1, 1); !m.isAfter(LocalDate.of(2026, 11, 1)); m = m.plusMonths(1)) cape.add(new SeriesPoint(m, 25));
        MvCalcService calc = calcWith(Map.of("PX_SPX", prices, "TIPS10Y", tips, "FS_FWD_PE", fwdPe, "SPX_CAPE", cape));
        MvStatsService service = new MvStatsService(calc);
        MvCalcService.Session session = calc.session();

        MvStatsService.Temperature t = service.temperature(session, MvStatsService.Window.Y20, LocalDate.of(2026, 11, 22), false);

        assertThat(t.components()).extracting(MvStatsService.Component::key).containsExactly("CAPE", "BUFFETT", "PS", "FWD_PE", "ERP");
        MvStatsService.Component fwd = t.components().get(3);
        MvStatsService.Component erp = t.components().get(4);
        assertThat(fwd.excluded()).isFalse();
        assertThat(fwd.percentile()).isGreaterThan(95);
        assertThat(erp.excluded()).isFalse();
        assertThat(erp.percentile()).isGreaterThan(95); // lowest premium = most expensive
        assertThat(t.components().get(0).percentile()).isCloseTo(50.0, within(1e-9)); // constant CAPE: every tie counts half
        assertThat(t.components().get(1).excludedReason()).isEqualTo("需要 FRED API Key");
        assertThat(t.components().get(2).excludedReason()).isEqualTo("无数据");
        assertThat(t.value()).isCloseTo((50.0 + fwd.percentile() + erp.percentile()) / 3, within(1e-9));
        assertThat(t.level()).isEqualTo("昂贵");
    }

    @Test
    void componentsWithTooFewSamplesAreExcludedFromTheTemperature() {
        List<SeriesPoint> fwdPe = List.of(pt("2026-09-25", 17), pt("2026-10-30", 17.5), pt("2026-11-20", 17.1));
        MvCalcService calc = calcWith(Map.of("FS_FWD_PE", fwdPe));
        MvStatsService service = new MvStatsService(calc);
        MvCalcService.Session session = calc.session();

        MvStatsService.Temperature t = service.temperature(session, MvStatsService.Window.Y20, LocalDate.of(2026, 11, 22), true);

        assertThat(t.value()).isNull();
        assertThat(t.level()).isNull();
        assertThat(t.components().get(3).excludedReason()).isEqualTo("样本不足");
    }

}

