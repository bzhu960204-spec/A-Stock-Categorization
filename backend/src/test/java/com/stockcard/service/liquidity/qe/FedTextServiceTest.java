package com.stockcard.service.liquidity.qe;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockcard.entity.FedTextEvent;
import com.stockcard.entity.QeRadarAlert;
import com.stockcard.repository.FedTextEventRepository;
import com.stockcard.repository.QeRadarAlertRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@DataJpaTest
class FedTextServiceTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-22T10:00:00Z"), ZoneOffset.UTC);
    private static final String PREFIX = FedTextClient.ALLOWED_PREFIX + "monetary";
    private static final String QUIET = "The Committee decided to maintain the target range for the federal funds rate.";

    @Autowired FedTextEventRepository repo;
    @Autowired QeRadarAlertRepository alertRepo;

    private final FedTextClient client = mock(FedTextClient.class);

    private FedTextService service() {
        return new FedTextService(client, repo, alertRepo, new ObjectMapper(), CLOCK);
    }

    private static FedDocument doc(String id, String date, FedDocType type, String body) {
        return new FedDocument(PREFIX + id + ".htm", LocalDate.parse(date), "Title " + id, type, body);
    }

    private void returning(FedDocument... docs) {
        when(client.fetch(anySet(), anyBoolean())).thenReturn(List.of(docs));
    }

    @Test
    void storesNewDocumentsWithTheirClassificationAndSkipsStoredUrls() {
        FedDocument first = doc("20260101a", "2026-01-01", FedDocType.STATEMENT, QUIET);
        returning(first);
        assertThat(service().sync(false)).isEqualTo(1);

        returning(first, doc("20261028a1", "2026-10-28", FedDocType.IMPL_NOTE, FedFixtures.body("20261028a1")));
        assertThat(service().sync(false)).isEqualTo(1); // the first one is already stored

        FedTextEvent note = repo.findAll().stream().filter(e -> e.getDocType().equals("IMPL_NOTE")).findFirst().orElseThrow();
        assertThat(note.getCategories()).isEqualTo("RMP");
        assertThat(note.getStance()).isEqualTo(2.0);
        assertThat(note.getDirective()).contains("Treasury bills");
        assertThat(note.getHits()).contains("\"category\":\"RMP\"");
        assertThat(repo.count()).isEqualTo(2);
    }

    @Test
    void theFirstRunBackfillsWithoutRaisingAlertsAndAsksForTheHistoricalPages() {
        returning(doc("20261028a1", "2026-10-28", FedDocType.IMPL_NOTE, FedFixtures.body("20261028a1")));

        service().sync(false);

        verify(client).fetch(anySet(), org.mockito.ArgumentMatchers.eq(true)); // empty table -> history included
        assertThat(repo.count()).isEqualTo(1);
        assertThat(alertRepo.count()).isZero();
    }

    @Test
    void recentNotableDocumentsRaiseATextAlertButOldOnesAndMinutesDoNot() {
        returning(doc("20260101a", "2026-01-01", FedDocType.STATEMENT, QUIET));
        service().sync(false); // non-empty table from here on

        String rmp = FedFixtures.body("20261028a1");
        returning(
                doc("20260301a", "2026-03-01", FedDocType.STATEMENT, rmp),     // 266 days old
                doc("20261118a", "2026-11-18", FedDocType.MINUTES, rmp),       // minutes never alert
                doc("20261028a1", "2026-10-28", FedDocType.IMPL_NOTE, rmp));   // 25 days old
        service().sync(false);

        List<QeRadarAlert> alerts = alertRepo.findAll();
        assertThat(alerts).hasSize(1);
        assertThat(alerts.get(0).getAlertType()).isEqualTo("TEXT_HIT");
        assertThat(alerts.get(0).getRefDate()).isEqualTo(LocalDate.of(2026, 10, 28));
        assertThat(alerts.get(0).getTitle()).contains("购买短债");
        assertThat(alerts.get(0).isAcknowledged()).isFalse();
        assertThat(repo.findAll().stream().filter(e -> e.getDocType().equals("MINUTES")).findFirst().orElseThrow().getStance()).isZero();
    }

    @Test
    void aChangedImplementationNoteInstructionIsRecordedAndAlerted() {
        returning(doc("20251210a1", "2025-12-10", FedDocType.IMPL_NOTE, FedFixtures.body("20251210a1")));
        service().sync(false);

        returning(doc("20261028a1", "2026-10-28", FedDocType.IMPL_NOTE, FedFixtures.body("20261028a1")));
        service().sync(false);

        FedTextEvent latest = repo.findAll().stream().filter(e -> e.getDocDate().equals(LocalDate.of(2026, 10, 28))).findFirst().orElseThrow();
        assertThat(latest.getDirectiveChanges()).contains("\"added\"").contains("When appropriate");
        assertThat(repo.findAll().stream().filter(e -> e.getDocDate().equals(LocalDate.of(2025, 12, 10))).findFirst().orElseThrow()
                .getDirectiveChanges()).isNull();
        assertThat(alertRepo.findAll()).hasSize(1);
    }

    @Test
    void documentsOutsideThePressReleaseWhitelistAreDropped() {
        returning(new FedDocument("https://evil.example/newsevents/pressreleases/monetary20260101a.htm", LocalDate.of(2026, 1, 1),
                "x", FedDocType.OTHER, QUIET));

        assertThat(service().sync(false)).isZero();
        assertThat(repo.count()).isZero();
    }

    @Test
    void aPageWithoutExtractableTextIsReportedByUrlAfterTheOthersAreStored() {
        returning(doc("20260101a", "2026-01-01", FedDocType.STATEMENT, QUIET), doc("20260201a", "2026-02-01", FedDocType.OTHER, " "));

        assertThatThrownBy(() -> service().sync(false)).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(PREFIX + "20260201a.htm");
        assertThat(repo.findAllUrls()).containsExactly(PREFIX + "20260101a.htm");
    }
}
