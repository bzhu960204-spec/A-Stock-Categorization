package com.stockcard.service.marketvaluation;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static com.stockcard.service.marketvaluation.MvFixtures.find;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MultplClientTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 22);

    private static MultplClient.Spec spec(String code) {
        return MultplClient.SPECS.stream().filter(s -> s.code().equals(code)).findFirst().orElseThrow();
    }

    @Test
    void firstRowThatBreaksTheMonthStartConventionBecomesTheSpot() {
        Map<String, List<MvPoint>> out = MultplClient.parse(MvFixtures.text("multpl-shiller-pe.html"), spec("SPX_CAPE"), TODAY);

        assertThat(find(out, "SPX_CAPE_SPOT", "2026-11-20").value()).isEqualTo(36.44);
        assertThat(find(out, "SPX_CAPE_SPOT", "2026-11-20").estimate()).isTrue();
        assertThat(find(out, "SPX_CAPE", "2026-11-01").value()).isEqualTo(39.82);
        assertThat(find(out, "SPX_CAPE", "2026-10-01").value()).isEqualTo(40.60);
        assertThat(out.get("SPX_CAPE")).extracting(MvPoint::date).doesNotContain(LocalDate.of(2026, 11, 20));
    }

    @Test
    void monthEndTableKeepsDaggersAsEstimatesAndDropsFutureRows() {
        Map<String, List<MvPoint>> out = MultplClient.parse(MvFixtures.text("multpl-dividend-yield.html"), spec("SPX_DY"), TODAY);

        assertThat(find(out, "SPX_DY_SPOT", "2026-11-20").value()).isEqualTo(1.17);
        assertThat(find(out, "SPX_DY", "2026-11-30")).isNull();
        assertThat(find(out, "SPX_DY", "2026-10-31").value()).isEqualTo(1.06);
        assertThat(find(out, "SPX_DY", "2026-10-31").estimate()).isTrue();
        assertThat(find(out, "SPX_DY", "2026-06-30").value()).isEqualTo(1.10);
        assertThat(find(out, "SPX_DY", "2026-06-30").estimate()).isFalse();
    }

    @Test
    void quarterTablesParseThousandsSeparatorsAndHaveNoSpotSeries() {
        Map<String, List<MvPoint>> out = MultplClient.parse(MvFixtures.text("multpl-sales.html"), spec("SPX_SPS"), TODAY);

        assertThat(find(out, "SPX_SPS", "2025-09-30").value()).isEqualTo(2042.16);
        assertThat(out).doesNotContainKey("SPX_SPS_SPOT");
    }

    @Test
    void dateConventionsAreRecognised() {
        assertThat(MultplClient.Convention.FIRST_OF_MONTH.matches(LocalDate.of(2026, 11, 1))).isTrue();
        assertThat(MultplClient.Convention.FIRST_OF_MONTH.matches(LocalDate.of(2026, 11, 20))).isFalse();
        assertThat(MultplClient.Convention.MONTH_END.matches(LocalDate.of(2026, 2, 28))).isTrue();
        assertThat(MultplClient.Convention.QUARTER_END.matches(LocalDate.of(2026, 9, 30))).isTrue();
        assertThat(MultplClient.Convention.QUARTER_END.matches(LocalDate.of(2026, 10, 31))).isFalse();
    }

    @Test
    void rowsOutsideTheSanityRangeAreDropped() {
        String html = "<table><tr><td>Oct 1, 2026</td><td>400.00</td></tr><tr><td>Sep 1, 2026</td><td>35.00</td></tr></table>";

        Map<String, List<MvPoint>> out = MultplClient.parse(html, spec("SPX_CAPE"), TODAY);

        assertThat(out.get("SPX_CAPE")).extracting(MvPoint::value).containsExactly(35.0);
    }

    @Test
    void aPageWithoutAnyUsableRowIsAFailure() {
        assertThatThrownBy(() -> MultplClient.parse("<html>maintenance</html>", spec("SPX_CAPE"), TODAY))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("页面结构可能已变化");
    }
}
