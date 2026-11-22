package com.stockcard.service.liquidity;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static com.stockcard.service.liquidity.Fixtures.json;
import static com.stockcard.service.liquidity.Fixtures.valueOn;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class TreasuryClientTest {

    private final Map<String, List<SeriesPoint>> tga = TreasuryClient.parse(json("treasury-tga.json"));

    @Test
    void usesTheFederalReserveAccountUpToSeptember2021() {
        assertThat(valueOn(tga, "TGA", "2021-09-30")).isCloseTo(215.160, within(1e-9));
    }

    @Test
    void usesTheTgaAccountCloseBalanceFromOctober2021() {
        assertThat(valueOn(tga, "TGA", "2021-10-01")).isCloseTo(132.452, within(1e-9));
    }

    @Test
    void usesOpenTodayBalOfTheClosingBalanceRowFromApril2022() {
        assertThat(valueOn(tga, "TGA", "2022-04-18")).isCloseTo(841.253, within(1e-9));
        assertThat(valueOn(tga, "TGA", "2026-11-19")).isCloseTo(891.223, within(1e-9));
    }

    @Test
    void neverPicksTheOpeningBalanceOrOtherAccountTypes() {
        // 892.310 is the opening balance of 2026-11-19 and 303.648 the deposits: neither may leak into the series
        assertThat(tga.get("TGA")).extracting(SeriesPoint::value)
                .doesNotContain(892.310, 303.648);
    }

    @Test
    void skipsRowsWhoseValueIsTheStringNull() {
        assertThat(valueOn(tga, "TGA", "2026-11-20")).isNull();
        assertThat(valueOn(tga, "TGA", "2021-10-04")).isNull();
        assertThat(tga.get("TGA")).hasSize(4);
    }
}
