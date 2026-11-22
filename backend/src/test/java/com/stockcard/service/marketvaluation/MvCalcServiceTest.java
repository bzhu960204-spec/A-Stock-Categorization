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
import java.util.Set;

import static com.stockcard.service.marketvaluation.MvFixtures.pt;
import static com.stockcard.service.marketvaluation.MvFixtures.value;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MvCalcServiceTest {

    private static List<SeriesPoint> octoberPrices() {
        List<SeriesPoint> prices = new ArrayList<>();
        for (int day = 1; day <= 31; day++) prices.add(pt("2026-10-" + String.format("%02d", day), 100));
        prices.add(pt("2026-11-02", 110));
        prices.add(pt("2026-11-20", 120));
        prices.add(pt("2026-11-23", 126));
        return prices;
    }

    @Test
    void anchorScaleUsesMonthAverageForMonthlyAnchorsAndSpotOverridesLater() {
        List<MvCalcService.Anchor> anchors = List.of(
                new MvCalcService.Anchor(LocalDate.of(2026, 10, 1), 40, MvCalcService.AnchorPriceRule.MONTH_AVG),
                new MvCalcService.Anchor(LocalDate.of(2026, 11, 20), 36, MvCalcService.AnchorPriceRule.AS_OF_CLOSE));

        List<SeriesPoint> out = MvCalcService.anchorScale(anchors, octoberPrices(), MvCalcService.Kind.PRICE_OVER_X);

        assertThat(value(out, "2026-10-15")).isCloseTo(40, within(1e-9));
        assertThat(value(out, "2026-11-02")).isCloseTo(44, within(1e-9)); // 110 / (100 / 40)
        assertThat(value(out, "2026-11-20")).isCloseTo(36, within(1e-9)); // the spot anchor takes over: F = 120 / 36
        assertThat(value(out, "2026-11-23")).isCloseTo(37.8, within(1e-9)); // 126 / (120 / 36)
    }

    @Test
    void nothingIsProducedBeforeTheFirstAnchorAndAnchorsWithoutPricesAreDropped() {
        List<MvCalcService.Anchor> anchors = List.of(
                new MvCalcService.Anchor(LocalDate.of(2026, 9, 1), 40, MvCalcService.AnchorPriceRule.MONTH_AVG), // no September prices
                new MvCalcService.Anchor(LocalDate.of(2026, 10, 15), 40, MvCalcService.AnchorPriceRule.AS_OF_CLOSE));

        List<SeriesPoint> out = MvCalcService.anchorScale(anchors, octoberPrices(), MvCalcService.Kind.PRICE_OVER_X);

        assertThat(out.get(0).date()).isEqualTo(LocalDate.of(2026, 10, 15));
    }

    @Test
    void yieldKindMultipliesAndInvertsThePriceRelation() {
        List<MvCalcService.Anchor> anchors = List.of(new MvCalcService.Anchor(LocalDate.of(2026, 10, 31), 2.0, MvCalcService.AnchorPriceRule.MONTH_AVG));

        List<SeriesPoint> out = MvCalcService.anchorScale(anchors, octoberPrices(), MvCalcService.Kind.YIELD);

        assertThat(value(out, "2026-10-31")).isCloseTo(2.0, within(1e-9)); // F = 2.0 * 100
        assertThat(value(out, "2026-11-20")).isCloseTo(200.0 / 120, within(1e-9));
    }

    @Test
    void asOfTakesTheLatestPointOnOrBeforeTheDateAndHonoursTheMaximumAge() {
        List<SeriesPoint> s = List.of(pt("2026-11-10", 1), pt("2026-11-17", 2));

        assertThat(MvCalcService.asOf(s, LocalDate.of(2026, 11, 17)).value()).isEqualTo(2);
        assertThat(MvCalcService.asOf(s, LocalDate.of(2026, 11, 16)).value()).isEqualTo(1);
        assertThat(MvCalcService.asOf(s, LocalDate.of(2026, 11, 9))).isNull();
        assertThat(MvCalcService.asOf(s, LocalDate.of(2026, 12, 30), 14)).isNull();
    }

    @Test
    void buffettQuarterlyDividesByTheGdpOfTheSameQuarter() {
        List<SeriesPoint> mv = List.of(pt("2026-06-30", 60000));
        List<SeriesPoint> gdp = List.of(pt("2026-01-01", 29000), pt("2026-04-01", 30000));

        assertThat(MvCalcService.buffettQuarterly(mv, gdp)).extracting(SeriesPoint::value).containsExactly(200.0);
    }

    @Test
    void buffettDailyCarriesTheQuarterEndValueOnTheWilshireIndex() {
        List<SeriesPoint> mv = List.of(pt("2026-06-30", 60000));
        List<SeriesPoint> gdp = List.of(pt("2026-04-01", 30000), pt("2026-07-01", 31000));
        List<SeriesPoint> w5000 = List.of(pt("2026-06-30", 100), pt("2026-09-30", 110), pt("2026-11-20", 120));

        List<SeriesPoint> out = MvCalcService.buffettDaily(mv, gdp, w5000);

        assertThat(value(out, "2026-06-30")).isCloseTo(200.0, within(1e-9));
        assertThat(value(out, "2026-09-30")).isCloseTo(60000 * 1.1 / 31000 * 100, within(1e-9));
        assertThat(value(out, "2026-11-20")).isCloseTo(60000 * 1.2 / 31000 * 100, within(1e-9));
    }

    @Test
    void sameDateJoinOnlyKeepsSharedDates() {
        List<SeriesPoint> ey = List.of(pt("2026-11-18", 2.8), pt("2026-11-19", 2.7), pt("2026-11-20", 2.75));
        List<SeriesPoint> tips = List.of(pt("2026-11-19", 2.0), pt("2026-11-20", 2.0));

        List<SeriesPoint> erp = MvCalcService.sameDateJoin(ey, tips, (a, b) -> a - b);

        assertThat(erp).hasSize(2);
        assertThat(value(erp, "2026-11-20")).isCloseTo(0.75, within(1e-9));
    }

    @Test
    void yoyComparesWithTheSameMonthOneYearEarlier() {
        List<SeriesPoint> eps = List.of(pt("2025-06-30", 250), pt("2025-07-31", 255), pt("2026-06-30", 300));

        List<SeriesPoint> out = MvCalcService.yoy(eps);

        assertThat(out).hasSize(1);
        assertThat(value(out, "2026-06-30")).isCloseTo(20.0, within(1e-9));
    }

    @Test
    void netMarginAndRoeMatchEpsToTheQuarterEndMonth() {
        List<SeriesPoint> eps = List.of(pt("2025-08-31", 290), pt("2025-09-30", 300));
        List<SeriesPoint> sps = List.of(pt("2025-09-30", 2000));

        assertThat(value(MvCalcService.quarterRatio(sps, eps), "2025-09-30")).isCloseTo(15.0, within(1e-9));
    }

    @Test
    void forwardEpsUsesTheReportCloseThenTheIndexAndRevisionsSkipGaps() {
        List<SeriesPoint> pe = List.of(pt("2026-08-21", 20), pt("2026-11-20", 17.1));
        List<SeriesPoint> close = List.of(pt("2026-11-20", 7175.83));
        List<SeriesPoint> spx = List.of(pt("2026-08-21", 6600));

        List<SeriesPoint> eps = MvCalcService.forwardEps(pe, close, spx);

        assertThat(value(eps, "2026-11-20")).isCloseTo(7175.83 / 17.1, within(1e-9));
        assertThat(value(eps, "2026-08-21")).isCloseTo(330, within(1e-9));

        List<SeriesPoint> rev = MvCalcService.revision(eps, 91); // 2026-11-20 - 91 days = 2026-08-21
        assertThat(value(rev, "2026-11-20")).isCloseTo((7175.83 / 17.1 / 330 - 1) * 100, within(1e-9));
        assertThat(MvCalcService.revision(List.of(pt("2026-11-20", 400), pt("2026-05-01", 300)), 91)).isEmpty(); // nearest older point is too far away
    }

    @Test
    void forwardErpUsesTheLatestYieldAndDropsStaleOnes() {
        List<SeriesPoint> out = MvCalcService.forwardErp(List.of(pt("2026-11-20", 20)), List.of(pt("2026-11-19", 4.0)));

        assertThat(value(out, "2026-11-20")).isCloseTo(1.0, within(1e-9));
        assertThat(MvCalcService.forwardErp(List.of(pt("2026-11-20", 20)), List.of(pt("2026-10-01", 4.0)))).isEmpty();
    }

    @Test
    void zScoreNeedsMeanAndPositiveSdOnTheSameDate() {
        List<SeriesPoint> z = MvCalcService.zScore(List.of(pt("2026-11-20", 26.37), pt("2026-11-21", 26.0)),
                List.of(pt("2026-11-20", 27.51), pt("2026-11-21", 27.51)), List.of(pt("2026-11-20", 3.95), pt("2026-11-21", 0)));

        assertThat(z).hasSize(1);
        assertThat(z.get(0).value()).isCloseTo(-0.2886, within(1e-3));
    }

    // ---- derived series through the service (repositories stubbed) ----

    private static MvCalcService serviceWith(Map<String, List<SeriesPoint>> data) {
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
        MvManualSeriesRepository manual = mock(MvManualSeriesRepository.class);
        when(manual.existsById("M_TEST")).thenReturn(true);
        return new MvCalcService(obsRepo, manual);
    }

    @Test
    void dailyCapeIsDerivedFromMonthlyAnchorsSpotAndPrices() {
        MvCalcService service = serviceWith(Map.of(
                "PX_SPX", octoberPrices(),
                "SPX_CAPE", List.of(pt("2026-10-01", 40)),
                "SPX_CAPE_SPOT", List.of(pt("2026-11-20", 36))));

        Map<String, List<SeriesPoint>> out = service.getSeries(Set.of("SPX_CAPE_D", "SPX_CAPE_EY_D"), LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 22));

        assertThat(out.get("SPX_CAPE_D")).extracting(SeriesPoint::date).containsExactly(LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 20));
        assertThat(value(out.get("SPX_CAPE_D"), "2026-11-02")).isCloseTo(44, within(1e-9));
        assertThat(value(out.get("SPX_CAPE_EY_D"), "2026-11-20")).isCloseTo(100.0 / 36, within(1e-9));
    }

    @Test
    void realErpIsTheCapeYieldMinusTheTipsYieldOnTheSameDay() {
        MvCalcService service = serviceWith(Map.of(
                "PX_SPX", octoberPrices(),
                "SPX_CAPE", List.of(pt("2026-10-01", 40)),
                "TIPS10Y", List.of(pt("2026-10-15", 1.5), pt("2026-10-16", 1.0))));

        List<SeriesPoint> erp = service.getSeries(Set.of("ERP_REAL_D"), LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31)).get("ERP_REAL_D");

        assertThat(erp).hasSize(2);
        assertThat(value(erp, "2026-10-16")).isCloseTo(100.0 / 40 - 1.0, within(1e-9));
    }

    @Test
    void worldPeZScoresAndManualSeriesAreReadable() {
        MvCalcService service = serviceWith(Map.of(
                "WPE_NDX", List.of(pt("2026-11-20", 26.37)),
                "WPE_NDX_AVG10Y", List.of(pt("2026-11-20", 27.51)),
                "WPE_NDX_SD10Y", List.of(pt("2026-11-20", 3.95)),
                "M_TEST", List.of(pt("2026-11-20", 14.9))));

        Map<String, List<SeriesPoint>> out = service.getSeries(Set.of("WPE_NDX_Z10Y", "M_TEST"), LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 30));

        assertThat(out.get("WPE_NDX_Z10Y").get(0).value()).isCloseTo(-0.2886, within(1e-3));
        assertThat(out.get("M_TEST")).hasSize(1);
    }

    @Test
    void unknownCodesAreRejected() {
        MvCalcService service = serviceWith(Map.of());

        assertThatThrownBy(() -> service.getSeries(Set.of("NOPE"), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 2, 1)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("NOPE");
    }
}
