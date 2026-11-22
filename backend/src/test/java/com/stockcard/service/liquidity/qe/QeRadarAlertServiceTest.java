package com.stockcard.service.liquidity.qe;

import com.stockcard.entity.QeRadarState;
import com.stockcard.repository.QeRadarAlertRepository;
import com.stockcard.repository.QeRadarStateRepository;
import com.stockcard.service.liquidity.LiquiditySyncFinishedEvent;
import com.stockcard.service.liquidity.LiquiditySyncService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@DataJpaTest
class QeRadarAlertServiceTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-22T10:00:00Z"), ZoneOffset.UTC);

    @Autowired QeRadarStateRepository stateRepo;
    @Autowired QeRadarAlertRepository alertRepo;

    private final QeRadarService radar = mock(QeRadarService.class);

    private QeRadarAlertService service() {
        return new QeRadarAlertService(radar, stateRepo, alertRepo, CLOCK);
    }

    private void radarShows(int level, QeLikelihood.Level likelihood) {
        QeStageEngine.StageResult stage = new QeStageEngine.StageResult(level, LocalDate.of(2026, 11, 22), List.of("SOMA 13 周 +30.0 bn ≥ 25"), null);
        when(radar.assessAt(any())).thenReturn(new QeRadarService.Assessment(LocalDate.of(2026, 11, 22), stage, null,
                new QeLikelihood.Result(likelihood, List.of("VIX 28.44（黄）")), List.of("维持现状"), List.of(), null));
    }

    private void seed(String key, String value) {
        QeRadarState row = new QeRadarState();
        row.setStateKey(key);
        row.setStateValue(value);
        row.setUpdatedAt(LocalDateTime.now(CLOCK));
        stateRepo.save(row);
    }

    @Test
    void theFirstRunOnlyRecordsTheStateAndRaisesNothing() {
        radarShows(1, QeLikelihood.Level.MEDIUM);

        service().evaluate();

        assertThat(alertRepo.count()).isZero();
        assertThat(stateRepo.findById("stage").orElseThrow().getStateValue()).isEqualTo("1");
        assertThat(stateRepo.findById("likelihood").orElseThrow().getStateValue()).isEqualTo("MEDIUM");
    }

    @Test
    void aChangedStageRaisesAStageAlertAndUpdatesTheState() {
        seed("stage", "0");
        seed("likelihood", "MEDIUM");
        radarShows(1, QeLikelihood.Level.MEDIUM);

        service().evaluate();

        assertThat(alertRepo.findAll()).singleElement().satisfies(a -> {
            assertThat(a.getAlertType()).isEqualTo("STAGE_CHANGE");
            assertThat(a.getTitle()).isEqualTo("放水阶段：L0 收水（QT） → L1 中性");
            assertThat(a.getDetail()).contains("SOMA 13 周");
            assertThat(a.isAcknowledged()).isFalse();
        });
        assertThat(stateRepo.findById("stage").orElseThrow().getStateValue()).isEqualTo("1");

        service().evaluate(); // nothing changed since: no second alert
        assertThat(alertRepo.count()).isEqualTo(1);
    }

    @Test
    void aChangedLikelihoodRaisesALikelihoodAlertWithTheReasons() {
        seed("stage", "1");
        seed("likelihood", "LOW");
        radarShows(1, QeLikelihood.Level.MEDIUM);

        service().evaluate();

        assertThat(alertRepo.findAll()).singleElement().satisfies(a -> {
            assertThat(a.getAlertType()).isEqualTo("LIKELIHOOD_CHANGE");
            assertThat(a.getTitle()).isEqualTo("升级可能性：低 → 中");
            assertThat(a.getDetail()).contains("VIX");
        });
    }

    @Test
    void aFailureInsideTheListenerNeverEscapesIt() {
        when(radar.assessAt(any())).thenThrow(new IllegalStateException("boom"));

        assertThatCode(() -> service().onSyncFinished(new LiquiditySyncFinishedEvent(LiquiditySyncService.Mode.INCREMENTAL)))
                .doesNotThrowAnyException();
        assertThat(alertRepo.count()).isZero();
    }

    @Test
    void acknowledgingOneOrAllAlertsUpdatesTheUnreadCountAndUnknownIdsAre404() {
        seed("stage", "0");
        seed("likelihood", "LOW");
        radarShows(2, QeLikelihood.Level.HIGH);
        QeRadarAlertService service = service();
        service.evaluate();
        assertThat(service.unreadCount()).isEqualTo(2);

        service.acknowledge(alertRepo.findAll().get(0).getId());
        assertThat(service.unreadCount()).isEqualTo(1);
        service.acknowledgeAll();
        assertThat(service.unreadCount()).isZero();
        assertThat(service.list(true, 50)).isEmpty();
        assertThat(service.list(false, 50)).hasSize(2);
        assertThatCode(() -> service.acknowledge(9999L)).hasMessageContaining("404");
    }
}
