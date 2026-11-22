package com.stockcard.service.marketvaluation;

import com.stockcard.entity.MvObservation;
import com.stockcard.repository.MvManualSeriesRepository;
import com.stockcard.repository.MvObservationRepository;
import com.stockcard.service.liquidity.SeriesPoint;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
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

class MvDecompositionServiceTest {

    @Test
    void totalAlwaysEqualsTheCompoundedValuationAndEarningsParts() {
        MvDecompositionService.Part part = MvDecompositionService.decompose(120, 100, 22, 20);

        assertThat(part.total()).isCloseTo(20.0, within(1e-9));
        assertThat(part.valuation()).isCloseTo(10.0, within(1e-9));
        assertThat((1 + part.valuation() / 100) * (1 + part.earnings() / 100)).isCloseTo(1 + part.total() / 100, within(1e-9));
        assertThat(part.earnings()).isCloseTo((1.2 / 1.1 - 1) * 100, within(1e-9));
    }

    @Test
    void aFlatMultipleAttributesEverythingToEarnings() {
        MvDecompositionService.Part part = MvDecompositionService.decompose(150, 100, 20, 20);

        assertThat(part.valuation()).isCloseTo(0, within(1e-9));
        assertThat(part.earnings()).isCloseTo(50, within(1e-9));
    }

    @Test
    void serviceBuildsRowsOnlyForHorizonsWithHistoryAndOmitsForwardWithoutFactset() {
        Map<String, List<SeriesPoint>> data = Map.of(
                "PX_SPX", List.of(pt("2025-11-20", 100), pt("2026-11-20", 120)),
                "SPX_PE", List.of(pt("2025-11-01", 20), pt("2026-11-01", 22)));
        MvObservationRepository repo = mock(MvObservationRepository.class);
        when(repo.findRange(anyString(), any(), any())).thenAnswer(inv -> {
            LocalDate from = inv.getArgument(1);
            List<MvObservation> rows = new ArrayList<>();
            for (SeriesPoint p : data.getOrDefault(inv.<String>getArgument(0), List.of())) {
                if (p.date().isBefore(from)) continue;
                MvObservation o = new MvObservation();
                o.setObsDate(p.date());
                o.setObsValue(p.value());
                rows.add(o);
            }
            return rows;
        });
        MvDecompositionService service = new MvDecompositionService(new MvCalcService(repo, mock(MvManualSeriesRepository.class)),
                Clock.fixed(Instant.parse("2026-11-22T04:00:00Z"), ZoneOffset.UTC));

        List<MvDecompositionService.Row> rows = service.decomposition();

        assertThat(rows).hasSize(1);
        MvDecompositionService.Row row = rows.get(0);
        assertThat(row.horizon()).isEqualTo("1Y");
        assertThat(row.startDate()).isEqualTo(LocalDate.of(2025, 11, 20));
        assertThat(row.endDate()).isEqualTo(LocalDate.of(2026, 11, 20));
        assertThat(row.ttm().total()).isCloseTo(20, within(1e-9));
        assertThat(row.ttm().valuation()).isCloseTo(10, within(1e-9));
        assertThat(row.cape()).isNull();
        assertThat(row.forward()).isNull();
    }
}
