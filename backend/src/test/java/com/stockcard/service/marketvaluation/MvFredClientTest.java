package com.stockcard.service.marketvaluation;

import com.stockcard.service.liquidity.FredClient;
import com.stockcard.service.liquidity.SeriesPoint;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MvFredClientTest {

    private List<SeriesPoint> parsedQuarterly() {
        double divisor = FredClient.unitDivisor(MvFixtures.json("fred-series-millions.json"));
        return FredClient.parseObservations(MvFixtures.json("fred-observations-quarterly.json"), divisor);
    }

    @Test
    void stockSeriesMoveFromQuarterStartToQuarterEndAndMillionsBecomeBillions() {
        List<MvPoint> points = MvFredClient.toPoints(parsedQuarterly(), true);

        assertThat(points).hasSize(1); // the "." observation is skipped
        assertThat(points.get(0).date()).isEqualTo(LocalDate.of(2026, 3, 31));
        assertThat(points.get(0).value()).isEqualTo(52000.0);
    }

    @Test
    void flowSeriesKeepTheirQuarterStartDate() {
        List<MvPoint> points = MvFredClient.toPoints(parsedQuarterly(), false);

        assertThat(points.get(0).date()).isEqualTo(LocalDate.of(2026, 1, 1));
    }

    @Test
    void quarterEndShiftHandlesEveryQuarter() {
        List<SeriesPoint> raw = List.of(new SeriesPoint(LocalDate.of(2026, 4, 1), 1), new SeriesPoint(LocalDate.of(2026, 7, 1), 2),
                new SeriesPoint(LocalDate.of(2026, 10, 1), 3));

        assertThat(MvFredClient.toPoints(raw, true)).extracting(MvPoint::date)
                .containsExactly(LocalDate.of(2026, 6, 30), LocalDate.of(2026, 9, 30), LocalDate.of(2026, 12, 31));
    }
}
