package com.stockcard.service.marketvaluation;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static com.stockcard.service.marketvaluation.MvFixtures.find;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorldPeClientTest {

    private static final LocalDate DATE = LocalDate.of(2026, 11, 20);

    @Test
    void parsesTheCurrentPeAndEveryRollingWindowFromDetaggedText() {
        Map<String, List<MvPoint>> out = WorldPeClient.parse(MvFixtures.text("worldperatio-nasdaq-100.txt"), MvMarket.NDX);

        assertThat(find(out, "WPE_NDX", "2026-11-20").value()).isEqualTo(26.37);
        assertThat(find(out, "WPE_NDX_AVG10Y", "2026-11-20").value()).isEqualTo(27.51);
        assertThat(find(out, "WPE_NDX_SD10Y", "2026-11-20").value()).isCloseTo(3.95, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(find(out, "WPE_NDX_SD1Y", "2026-11-20").value()).isCloseTo(1.54, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(find(out, "WPE_NDX_AVG20Y", "2026-11-20").value()).isEqualTo(22.66);
        assertThat(out).hasSize(1 + 4 * 2);
    }

    @Test
    void rawHtmlIsCleanedAndOnlyAvailableWindowsAreWritten() {
        Map<String, List<MvPoint>> out = WorldPeClient.parse(MvFixtures.text("worldperatio-nasdaq-100.html"), MvMarket.NDX);

        assertThat(find(out, "WPE_NDX", "2026-11-20").value()).isEqualTo(26.37); // the value inside <script> is ignored
        assertThat(out).containsKeys("WPE_NDX_AVG5Y", "WPE_NDX_SD5Y", "WPE_NDX_AVG10Y", "WPE_NDX_SD10Y");
        assertThat(out).doesNotContainKeys("WPE_NDX_AVG1Y", "WPE_NDX_AVG20Y");
        assertThat(find(out, "WPE_NDX_SD5Y", "2026-11-20").value()).isCloseTo(3.0, org.assertj.core.data.Offset.offset(1e-9));
    }

    @Test
    void aPageWithoutDataIsAFailure() {
        assertThatThrownBy(() -> WorldPeClient.parse("<html><body>CSI 300 coming soon</body></html>", MvMarket.CN))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void zScoreOfTheFixtureIsInTheFairBand() {
        Map<String, List<MvPoint>> out = WorldPeClient.parse(MvFixtures.text("worldperatio-nasdaq-100.txt"), MvMarket.NDX);
        double z = (out.get("WPE_NDX").get(0).value() - out.get("WPE_NDX_AVG10Y").get(0).value()) / out.get("WPE_NDX_SD10Y").get(0).value();

        assertThat(z).isCloseTo(-0.29, org.assertj.core.data.Offset.offset(0.01));
        assertThat(MvMarketService.label(z)).isEqualTo("合理");
        assertThat(DATE).isEqualTo(out.get("WPE_NDX").get(0).date());
    }

    @Test
    void zLabelsHaveTheirBoundariesInclusiveOnTheFairSide() {
        assertThat(MvMarketService.label(2.01)).isEqualTo("昂贵");
        assertThat(MvMarketService.label(2.0)).isEqualTo("高估");
        assertThat(MvMarketService.label(1.0)).isEqualTo("合理");
        assertThat(MvMarketService.label(-1.0)).isEqualTo("合理");
        assertThat(MvMarketService.label(-1.01)).isEqualTo("低估");
        assertThat(MvMarketService.label(-2.0)).isEqualTo("低估");
        assertThat(MvMarketService.label(-2.01)).isEqualTo("便宜");
    }
}
