package com.stockcard.service.liquidity;

import com.stockcard.entity.LiquidityObservation;
import com.stockcard.repository.LiquidityManualSeriesRepository;
import com.stockcard.repository.LiquidityObservationRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.stockcard.service.liquidity.Fixtures.pt;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LiquidityCalcServiceTest {

    @Test
    void iorbIsJoinedAsOfSoItNeedsNoObservationOnTheSameDay() {
        List<SeriesPoint> sofr = List.of(pt("2026-11-05", 3.91), pt("2026-11-06", 3.89));
        List<SeriesPoint> iorb = List.of(pt("2026-11-01", 3.90)); // a single step valid until changed

        List<SeriesPoint> spread = LiquidityCalcService.spreadBpAsOf(sofr, iorb);

        assertThat(spread).extracting(SeriesPoint::value).containsExactly(1.0, -1.0);
    }

    @Test
    void ioerAndIorbJoinSeamlesslyAcrossTheJuly2021Rename() {
        // the FRED client merges IOER (<= 2021-07-28) and IORB (>= 2021-07-29) into one series
        List<SeriesPoint> iorb = List.of(pt("2021-07-28", 0.15), pt("2021-07-29", 0.15), pt("2021-12-16", 0.15));
        List<SeriesPoint> sofr = List.of(pt("2021-07-27", 0.05), pt("2021-07-30", 0.05), pt("2021-07-26", 0.06));

        List<SeriesPoint> spread = LiquidityCalcService.spreadBpAsOf(sofr, iorb);

        // 2021-07-26/27 precede the first IORB observation: no value is invented for them
        assertThat(spread).hasSize(1);
        assertThat(spread.get(0).date()).isEqualTo(LocalDate.of(2021, 7, 30));
        assertThat(spread.get(0).value()).isEqualTo(-10.0);
    }

    @Test
    void spreadsAreOnlyProducedWhereBothSeriesHaveAnObservation() {
        List<SeriesPoint> sofr = List.of(pt("2026-11-19", 3.91), pt("2026-11-20", 3.90), pt("2026-11-23", 3.92));
        List<SeriesPoint> effr = List.of(pt("2026-11-19", 3.88), pt("2026-11-23", 3.88));

        List<SeriesPoint> spread = LiquidityCalcService.spreadBp(sofr, effr);

        assertThat(spread).extracting(p -> p.date().toString()).containsExactly("2026-11-19", "2026-11-23");
        assertThat(spread).extracting(SeriesPoint::value).containsExactly(3.0, 4.0); // floating-point noise is rounded away
    }

    @Test
    void liqRatioUsesTheWednesdayAndTheAverageOfTheThursdayToWednesdayRrp() {
        List<SeriesPoint> reserves = List.of(pt("2026-11-18", 3000));
        List<SeriesPoint> bank = List.of(pt("2026-11-18", 27000));
        List<SeriesPoint> rrp = List.of(
                pt("2026-11-11", 900),  // the Wednesday before the window: excluded
                pt("2026-11-12", 10), pt("2026-11-13", 20), pt("2026-11-16", 30), pt("2026-11-18", 40),
                pt("2026-11-19", 500)); // after the Wednesday: excluded

        List<SeriesPoint> ratio = LiquidityCalcService.liqRatio(reserves, rrp, bank);

        // average RRP = (10 + 20 + 30 + 40) / 4 = 25 -> (3000 + 25) / 27000
        assertThat(ratio).hasSize(1);
        assertThat(ratio.get(0).value()).isCloseTo(11.203704, within(1e-6));
    }

    @Test
    void liqRatioTreatsAWeekWithoutRrpAsZeroAndNeedsBankAssets() {
        List<SeriesPoint> reserves = List.of(pt("2026-11-11", 2700), pt("2026-11-18", 3000));
        List<SeriesPoint> bank = List.of(pt("2026-11-11", 27000)); // no bank assets for the 18th yet (H.8 lags)

        List<SeriesPoint> ratio = LiquidityCalcService.liqRatio(reserves, List.of(), bank);

        assertThat(ratio).hasSize(1);
        assertThat(ratio.get(0).date()).isEqualTo(LocalDate.of(2026, 11, 11));
        assertThat(ratio.get(0).value()).isEqualTo(10.0);
    }

    @Test
    void reservesPlusRrpAddsTheWeeklyAverage() {
        List<SeriesPoint> out = LiquidityCalcService.reservesPlusRrp(
                List.of(pt("2026-11-18", 3000)), List.of(pt("2026-11-17", 10), pt("2026-11-18", 30)));
        assertThat(out.get(0).value()).isEqualTo(3020.0);
    }

    @Test
    void monthlySumGroupsByCalendarMonthAndDatesItOnTheLastDay() {
        List<SeriesPoint> rmp = List.of(pt("2026-10-29", 1.5), pt("2026-11-03", 2.0), pt("2026-11-18", 2.0), pt("2026-11-19", 0.4));

        List<SeriesPoint> monthly = LiquidityCalcService.monthlySum(rmp);

        assertThat(monthly).extracting(p -> p.date().toString()).containsExactly("2026-10-31", "2026-11-30");
        assertThat(monthly).extracting(SeriesPoint::value).containsExactly(1.5, 4.4);
    }

    @Test
    void eraBoundaries() {
        assertThat(LiquidityCalcService.eraOf(LocalDate.of(2021, 8, 31))).isEqualTo("EARLY");
        assertThat(LiquidityCalcService.eraOf(LocalDate.of(2021, 9, 1))).isEqualTo("MID");
        assertThat(LiquidityCalcService.eraOf(LocalDate.of(2026, 3, 31))).isEqualTo("MID");
        assertThat(LiquidityCalcService.eraOf(LocalDate.of(2026, 4, 1))).isEqualTo("RECENT");
    }

    @Test
    void derivedSeriesLoadExtraHistoryForTheAsOfJoinButAreTrimmedToTheRequestedRange() {
        LiquidityObservationRepository obsRepo = mock(LiquidityObservationRepository.class);
        LiquidityManualSeriesRepository manualRepo = mock(LiquidityManualSeriesRepository.class);
        LocalDate from = LocalDate.of(2026, 11, 10);
        LocalDate to = LocalDate.of(2026, 11, 20);
        // IORB was last changed 20 days before `from`; it is only found thanks to the 30-day look-back
        when(obsRepo.findBySeriesCodeAndObsDateBetweenOrderByObsDateAsc(eq("IORB"), any(), any()))
                .thenReturn(List.of(obs("IORB", "2026-10-21", 3.90)));
        when(obsRepo.findBySeriesCodeAndObsDateBetweenOrderByObsDateAsc(eq("SOFR"), any(), any()))
                .thenReturn(List.of(obs("SOFR", "2026-11-05", 3.95), obs("SOFR", "2026-11-12", 3.91), obs("SOFR", "2026-11-19", 3.92)));

        List<SeriesPoint> spread = new LiquidityCalcService(obsRepo, manualRepo).getSeries("SOFR_IORB", from, to);

        assertThat(spread).extracting(p -> p.date().toString()).containsExactly("2026-11-12", "2026-11-19");
        assertThat(spread).extracting(SeriesPoint::value).containsExactly(1.0, 2.0);
    }

    @Test
    void rawSeriesAreReturnedAsStoredAndUnknownCodesAreRejected() {
        LiquidityObservationRepository obsRepo = mock(LiquidityObservationRepository.class);
        LiquidityManualSeriesRepository manualRepo = mock(LiquidityManualSeriesRepository.class);
        when(manualRepo.existsById("CDS_ORCL_5Y")).thenReturn(true);
        when(obsRepo.findBySeriesCodeAndObsDateBetweenOrderByObsDateAsc(eq("CDS_ORCL_5Y"), any(), any()))
                .thenReturn(List.of(obs("CDS_ORCL_5Y", "2026-11-19", 257)));
        LiquidityCalcService calc = new LiquidityCalcService(obsRepo, manualRepo);

        Map<String, List<SeriesPoint>> out = calc.getSeries(Set.of("CDS_ORCL_5Y"), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 11, 22));

        assertThat(out.get("CDS_ORCL_5Y")).containsExactly(pt("2026-11-19", 257));
        assertThatThrownBy(() -> calc.getSeries(Set.of("NOPE"), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 11, 22)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("NOPE");
    }

    @Test
    void changeOverUsesTheLatestObservationOnOrBeforeTheEarlierDateAndSkipsDaysWithoutOne() {
        // 2026-11-10 is a holiday-shifted Tuesday, so 91 days earlier is a Tuesday too: the weekly Wednesday point before it is used
        List<SeriesPoint> soma = List.of(pt("2026-08-05", 6290), pt("2026-08-12", 6300), pt("2026-08-19", 6368.75),
                pt("2026-11-10", 6364.92), pt("2026-11-18", 6364.87));

        List<SeriesPoint> change = LiquidityCalcService.changeOver(soma, 91);

        // the first two points have no observation 91 days earlier and are skipped
        assertThat(change).extracting(p -> p.date().toString()).containsExactly("2026-11-10", "2026-11-18");
        assertThat(change).extracting(SeriesPoint::value).containsExactly(74.92, -3.88);
        assertThat(LiquidityCalcService.changeOver(List.of(pt("2026-11-18", 1)), 91)).isEmpty();
    }

    @Test
    void qeOpsSumTheLast28DaysOnEveryWeekdayAndDecayToZeroAfterThePurchases() {
        List<SeriesPoint> ops = List.of(pt("2026-01-05", 30), pt("2026-01-12", 20));

        List<SeriesPoint> sum = LiquidityCalcService.trailingSum(ops, 28, LocalDate.of(2026, 1, 5), LocalDate.of(2026, 2, 16));

        Map<String, Double> byDate = new java.util.HashMap<>();
        sum.forEach(p -> byDate.put(p.date().toString(), p.value()));
        assertThat(byDate.get("2026-01-05")).isEqualTo(30.0);
        assertThat(byDate.get("2026-01-12")).isEqualTo(50.0);
        assertThat(byDate.get("2026-02-01")).isNull(); // a Sunday
        assertThat(byDate.get("2026-02-02")).isEqualTo(20.0); // the 01-05 purchase fell out: 01-05 + 27d = 02-01 was its last day
        assertThat(byDate.get("2026-02-09")).isEqualTo(0.0); // 01-12 + 27d = 02-08
        assertThat(sum.get(sum.size() - 1).date()).isEqualTo(LocalDate.of(2026, 2, 16));
    }

    @Test
    void nonSecuritiesToleratesSixDaysOfSomaStalenessButNotMore() {
        List<SeriesPoint> assets = List.of(pt("2026-11-18", 6700), pt("2026-11-24", 6705), pt("2026-11-25", 6710));
        List<SeriesPoint> soma = List.of(pt("2026-11-18", 6364.9));

        List<SeriesPoint> out = LiquidityCalcService.nonSecurities(assets, soma);

        assertThat(out).extracting(p -> p.date().toString()).containsExactly("2026-11-18", "2026-11-24"); // the 25th is 7 days after
        assertThat(out.get(0).value()).isCloseTo(335.1, within(1e-6));
    }

    @Test
    void netLiquiditySkipsDaysWithoutATgaAndTreatsMissingRrpAsZero() {
        List<SeriesPoint> assets = List.of(pt("2026-11-18", 6700), pt("2026-11-25", 6710));
        List<SeriesPoint> tga = List.of(pt("2026-11-17", 900)); // 8 days before the 25th: too old for the second date

        List<SeriesPoint> out = LiquidityCalcService.netLiquidity(assets, tga, List.of());

        assertThat(out).hasSize(1);
        assertThat(out.get(0).value()).isEqualTo(5800.0);
        assertThat(LiquidityCalcService.netLiquidity(assets, tga, List.of(pt("2026-11-17", 50))).get(0).value()).isEqualTo(5750.0);
    }

    @Test
    void cutPricingIsTheTwoYearYieldMinusEffrInBasisPointsOnSharedDatesOnly() {
        List<SeriesPoint> out = LiquidityCalcService.derive(LiquiditySeries.CUT_PRICING, code -> switch (code) {
            case "UST2Y" -> List.of(pt("2026-11-19", 4.76), pt("2026-11-20", 4.70));
            case "EFFR" -> List.of(pt("2026-11-19", 3.88));
            default -> List.of();
        });

        assertThat(out).containsExactly(pt("2026-11-19", 88.0));
    }

    @Test
    void rateChangeLooksBack182DaysInBasisPoints() {
        List<SeriesPoint> out = LiquidityCalcService.derive(LiquiditySeries.RATE_CHANGE_6M, code -> List.of(
                pt("2026-05-01", 4.00), pt("2026-11-01", 3.75)));

        assertThat(out).containsExactly(pt("2026-11-01", -25.0));
    }

    private static LiquidityObservation obs(String code, String date, double value) {
        LiquidityObservation o = new LiquidityObservation();
        o.setSeriesCode(code);
        o.setObsDate(LocalDate.parse(date));
        o.setObsValue(value);
        return o;
    }
}
