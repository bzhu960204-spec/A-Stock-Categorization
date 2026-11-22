package com.stockcard.service.liquidity;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static com.stockcard.service.liquidity.Fixtures.json;
import static com.stockcard.service.liquidity.Fixtures.valueOn;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class NyFedClientTest {

    @Test
    void parsesSofrWithPercentilesAndSkipsMissingOnes() {
        Map<String, List<SeriesPoint>> s = NyFedClient.parseRates(json("nyfed-rates-sofr.json"));

        assertThat(valueOn(s, "SOFR", "2026-11-19")).isEqualTo(3.91);
        assertThat(valueOn(s, "SOFR_P1", "2026-11-19")).isEqualTo(3.85);
        assertThat(valueOn(s, "SOFR_P25", "2026-11-19")).isEqualTo(3.88);
        assertThat(valueOn(s, "SOFR_P75", "2026-11-19")).isEqualTo(3.95);
        assertThat(valueOn(s, "SOFR_P99", "2026-11-19")).isEqualTo(3.98);
        assertThat(valueOn(s, "SOFR_VOL", "2026-11-19")).isEqualTo(3161);

        // the 2018 record has no percentiles: the rate is stored, the percentile series simply has no point that day
        assertThat(valueOn(s, "SOFR", "2018-04-02")).isEqualTo(1.83);
        assertThat(valueOn(s, "SOFR_P99", "2018-04-02")).isNull();
        assertThat(s.get("SOFR_P99")).hasSize(1);
    }

    @Test
    void parsesTgcrBgcrAndEffrWithTargetRange() {
        Map<String, List<SeriesPoint>> s = NyFedClient.parseRates(json("nyfed-rates-sofr.json"));
        assertThat(valueOn(s, "TGCR", "2026-11-19")).isEqualTo(3.88);
        assertThat(valueOn(s, "TGCR_P99", "2026-11-19")).isEqualTo(3.93);
        assertThat(valueOn(s, "TGCR_VOL", "2026-11-19")).isEqualTo(1800);
        assertThat(valueOn(s, "BGCR", "2026-11-19")).isEqualTo(3.89);

        Map<String, List<SeriesPoint>> e = NyFedClient.parseRates(json("nyfed-rates-effr.json"));
        assertThat(valueOn(e, "EFFR", "2026-11-19")).isEqualTo(3.88);
        assertThat(valueOn(e, "EFFR_VOL", "2026-11-19")).isEqualTo(100);
        assertThat(valueOn(e, "FFTR_LOW", "2026-11-19")).isEqualTo(3.75);
        assertThat(valueOn(e, "FFTR_HIGH", "2026-11-19")).isEqualTo(4.00);
    }

    @Test
    void splitsRepoFromReverseRepoAndSumsSameDayOperations() {
        Map<String, List<SeriesPoint>> s = NyFedClient.parseRepo(json("nyfed-rp.json"));

        // 2026-11-20: one idle repo operation and one reverse repo
        assertThat(valueOn(s, "SRF_AMT", "2026-11-20")).isEqualTo(0.0);
        assertThat(valueOn(s, "SRF_RATE", "2026-11-20")).isEqualTo(4.00);
        assertThat(valueOn(s, "ONRRP_AMT", "2026-11-20")).isCloseTo(0.401, within(1e-9));
        assertThat(valueOn(s, "ONRRP_RATE", "2026-11-20")).isEqualTo(3.75);

        // 2026-11-19: two repo and two reverse repo operations are summed; the SRF rate is the lowest bid
        assertThat(valueOn(s, "SRF_AMT", "2026-11-19")).isCloseTo(0.011, within(1e-9));
        assertThat(valueOn(s, "SRF_RATE", "2026-11-19")).isEqualTo(3.95);
        assertThat(valueOn(s, "ONRRP_AMT", "2026-11-19")).isCloseTo(1.5, within(1e-9));
    }

    @Test
    void ignoresOperationsThatAreOnlyAnnounced() {
        Map<String, List<SeriesPoint>> s = NyFedClient.parseRepo(json("nyfed-rp.json"));
        assertThat(valueOn(s, "SRF_AMT", "2026-11-21")).isNull();
        assertThat(valueOn(s, "SRF_RATE", "2026-11-21")).isNull();
    }

    @Test
    void sumsOnlyBillPurchasesAndParsesStringAmounts() {
        Map<String, List<SeriesPoint>> s = NyFedClient.parseTreasuryPurchases(json("nyfed-tsy.json"));

        assertThat(valueOn(s, "RMP_BILLS", "2026-11-18")).isCloseTo(2.0, within(1e-9)); // 1.756 + 0.244
        assertThat(valueOn(s, "RMP_BILLS", "2026-11-17")).isNull(); // coupon purchase
        assertThat(valueOn(s, "RMP_BILLS", "2026-11-16")).isNull(); // sale
        assertThat(s.get("RMP_BILLS")).hasSize(1);
    }

    @Test
    void parsesSomaAmountsFromDollarStringsAndTreatsBlanksAsZero() {
        Map<String, List<SeriesPoint>> s = NyFedClient.parseSoma(json("nyfed-soma-summary.json"));

        assertThat(valueOn(s, "SOMA_TOTAL", "2026-11-18")).isCloseTo(6364.865229, within(1e-6));
        assertThat(valueOn(s, "SOMA_BILLS", "2026-11-18")).isCloseTo(580.659927, within(1e-6));
        assertThat(valueOn(s, "SOMA_COUPONS", "2026-11-18")).isCloseTo(3597.864735 + 277.655586 + 22.873047, within(1e-6));
        assertThat(valueOn(s, "SOMA_MBS", "2026-11-18")).isCloseTo(1876.153374 + 7.311561 + 2.347, within(1e-6));
        // the three groups add up to the total (inflation compensation is not part of it)
        double sum = valueOn(s, "SOMA_BILLS", "2026-11-18") + valueOn(s, "SOMA_COUPONS", "2026-11-18") + valueOn(s, "SOMA_MBS", "2026-11-18");
        assertThat(sum).isCloseTo(valueOn(s, "SOMA_TOTAL", "2026-11-18"), within(0.01));
        // a blank frn field is 0
        assertThat(valueOn(s, "SOMA_COUPONS", "2003-07-09")).isCloseTo(398.852847 + 12.814483, within(1e-6));
        // the holiday-shifted Tuesday is stored under its own date
        assertThat(valueOn(s, "SOMA_TOTAL", "2026-11-10")).isNotNull();
        assertThat(s.get("SOMA_TOTAL")).hasSize(4);
    }

    @Test
    void netsCouponPurchasesAndSalesPerDayAndIgnoresRoutineTestOperations() {
        Map<String, List<SeriesPoint>> s = NyFedClient.parseTreasuryPurchases(json("nyfed-tsy-mixed.json"));

        assertThat(valueOn(s, "COUPON_OPS_NET", "2025-11-04")).isNull(); // 0.05 bn test purchase
        assertThat(valueOn(s, "COUPON_OPS_NET", "2026-11-03")).isNull(); // 0.05 bn test sale
        assertThat(valueOn(s, "COUPON_OPS_NET", "2020-04-30")).isCloseTo(3.0, within(1e-9));
        assertThat(valueOn(s, "COUPON_OPS_NET", "2012-09-26")).isCloseTo(0.5, within(1e-9)); // Operation Twist: buy 8.0, sell 7.5
        assertThat(valueOn(s, "COUPON_OPS_NET", "2012-09-27")).isNull(); // buys and sells cancel out exactly
        assertThat(valueOn(s, "COUPON_OPS_NET", "2026-11-23")).isNull(); // announced only
        assertThat(valueOn(s, "AGENCY_OPS_NET", "2009-03-25")).isCloseTo(2.0, within(1e-9));
        assertThat(valueOn(s, "RMP_BILLS", "2020-04-30")).isCloseTo(0.04, within(1e-9)); // bill purchases are not filtered
    }

    @Test
    void countsOnlyOutrightMbsOperationsAndSignsSalesNegative() {
        Map<String, List<SeriesPoint>> s = NyFedClient.parseMbsOperations(json("nyfed-ambs.json"));

        assertThat(valueOn(s, "AGENCY_OPS_NET", "2020-03-31")).isCloseTo(7.115, within(1e-9));
        assertThat(valueOn(s, "AGENCY_OPS_NET", "2020-04-01")).isCloseTo(2.0, within(1e-9)); // purchase 3.0, sale 1.0
        assertThat(valueOn(s, "AGENCY_OPS_NET", "2026-11-18")).isNull(); // blank amount
        assertThat(valueOn(s, "AGENCY_OPS_NET", "2026-11-12")).isNull(); // coupon swap
        assertThat(valueOn(s, "AGENCY_OPS_NET", "2026-11-10")).isNull(); // dollar roll
        assertThat(valueOn(s, "AGENCY_OPS_NET", "2020-04-02")).isNull(); // 0.03 bn test
        assertThat(s.get("AGENCY_OPS_NET")).hasSize(2);
    }

    @Test
    void chunksCoverTheRangeWithoutGapsOrOverlap() {
        List<LocalDate[]> rates = NyFedClient.chunks(LocalDate.of(2018, 4, 1), LocalDate.of(2026, 11, 22), 3);
        assertThat(rates).hasSize(3);
        assertThat(rates.get(0)[0]).isEqualTo(LocalDate.of(2018, 4, 1));
        assertThat(rates.get(0)[1]).isEqualTo(LocalDate.of(2021, 3, 31));
        assertThat(rates.get(1)[0]).isEqualTo(LocalDate.of(2021, 4, 1));
        assertThat(rates.get(2)[1]).isEqualTo(LocalDate.of(2026, 11, 22));

        List<LocalDate[]> years = NyFedClient.calendarYearChunks(LocalDate.of(2025, 11, 12), LocalDate.of(2026, 11, 22));
        assertThat(years).hasSize(2);
        assertThat(years.get(0)[1]).isEqualTo(LocalDate.of(2025, 12, 31));
        assertThat(years.get(1)[0]).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(years.get(1)[1]).isEqualTo(LocalDate.of(2026, 11, 22));
    }
}
