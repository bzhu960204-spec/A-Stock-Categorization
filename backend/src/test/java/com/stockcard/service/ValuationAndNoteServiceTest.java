package com.stockcard.service;

import com.stockcard.entity.ValuationSnapshot;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Import({ValuationService.class, EarningsNoteService.class})
class ValuationAndNoteServiceTest {

    @Autowired ValuationService valuationService;
    @Autowired EarningsNoteService noteService;

    private ValuationSnapshot snapshot(String ticker, String name, String date) {
        ValuationSnapshot v = new ValuationSnapshot();
        v.setTicker(ticker);
        v.setCompanyName(name);
        v.setSnapshotDate(LocalDate.parse(date));
        return v;
    }

    @Test
    void createNormalizesTickerAndIgnoresClientId() {
        ValuationSnapshot in = snapshot(" aapl ", "Apple", "2026-01-01");
        in.setId(12345L);

        ValuationSnapshot saved = valuationService.create(in);

        assertThat(saved.getId()).isNotEqualTo(12345L);
        assertThat(saved.getTicker()).isEqualTo("AAPL");
        assertThat(valuationService.list("aapl")).hasSize(1);
    }

    @Test
    void updatePreservesCreatedAt() {
        ValuationSnapshot saved = valuationService.create(snapshot("MSFT", "Microsoft", "2026-01-01"));
        var createdAt = saved.getCreatedAt();

        ValuationSnapshot changes = snapshot("msft", "Microsoft Corp", "2026-02-01");
        ValuationSnapshot updated = valuationService.update(saved.getId(), changes).orElseThrow();

        assertThat(updated.getCreatedAt()).isEqualTo(createdAt);
        assertThat(updated.getCompanyName()).isEqualTo("Microsoft Corp");
        assertThat(valuationService.update(9999L, changes)).isEmpty();
    }

    @Test
    void companiesListsEachTickerOnceWithItsEarliestName() {
        valuationService.create(snapshot("NVDA", "Nvidia", "2026-01-01"));
        valuationService.create(snapshot("AAPL", "Apple", "2026-01-01"));
        valuationService.create(snapshot("NVDA", "NVIDIA Corp", "2026-02-01"));

        List<Map<String, String>> companies = valuationService.companies();

        assertThat(companies).containsExactly(
                Map.of("ticker", "AAPL", "companyName", "Apple"),
                Map.of("ticker", "NVDA", "companyName", "Nvidia"));
    }

    @Test
    void deleteReportsWhetherSomethingWasRemoved() {
        ValuationSnapshot saved = valuationService.create(snapshot("TSLA", "Tesla", "2026-01-01"));
        assertThat(valuationService.delete(saved.getId())).isTrue();
        assertThat(valuationService.delete(saved.getId())).isFalse();
    }

    @Test
    void notesAreKeyedByNormalizedTickerAndBlankContentDeletes() {
        LocalDate date = LocalDate.of(2026, 1, 30);
        noteService.save(" aapl ", date, "beat");
        assertThat(noteService.getContent("AAPL", date)).isEqualTo("beat");

        noteService.save("AAPL", date, "beat and raise");
        assertThat(noteService.getContent("aapl", date)).isEqualTo("beat and raise");

        noteService.save("AAPL", date, "  ");
        assertThat(noteService.getContent("AAPL", date)).isEmpty();
    }
}
