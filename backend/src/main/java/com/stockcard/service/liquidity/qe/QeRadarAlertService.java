package com.stockcard.service.liquidity.qe;

import com.stockcard.entity.QeRadarAlert;
import com.stockcard.entity.QeRadarState;
import com.stockcard.repository.QeRadarAlertRepository;
import com.stockcard.repository.QeRadarStateRepository;
import com.stockcard.service.liquidity.LiquiditySyncFinishedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** In-app notifications: a change of the ladder stage or of the upgrade likelihood after a sync (qe-radar §5.5). */
@Service
public class QeRadarAlertService {

    private static final Logger log = LoggerFactory.getLogger(QeRadarAlertService.class);
    private static final String STAGE = "stage";
    private static final String LIKELIHOOD = "likelihood";
    private static final Map<String, String> LIKELIHOOD_NAMES = Map.of("LOW", "低", "MEDIUM", "中", "HIGH", "高");
    private static final int MAX_DETAIL = 2000;

    private final QeRadarService radar;
    private final QeRadarStateRepository stateRepo;
    private final QeRadarAlertRepository alertRepo;
    private final Clock clock;

    @Autowired
    public QeRadarAlertService(QeRadarService radar, QeRadarStateRepository stateRepo, QeRadarAlertRepository alertRepo) {
        this(radar, stateRepo, alertRepo, Clock.systemDefaultZone());
    }

    QeRadarAlertService(QeRadarService radar, QeRadarStateRepository stateRepo, QeRadarAlertRepository alertRepo, Clock clock) {
        this.radar = radar;
        this.stateRepo = stateRepo;
        this.alertRepo = alertRepo;
        this.clock = clock;
    }

    /** Runs on the sync thread; it swallows every failure so that an alert problem can never fail a sync. */
    @EventListener
    public void onSyncFinished(LiquiditySyncFinishedEvent event) {
        try {
            evaluate();
        } catch (Exception e) {
            log.warn("QE radar alert evaluation failed: {}", e.getMessage());
        }
    }

    void evaluate() {
        LocalDate today = LocalDate.now(clock);
        QeRadarService.Assessment a = radar.assessAt(today);

        String stage = String.valueOf(a.stage().level());
        replaceState(STAGE, stage).filter(old -> !old.equals(stage)).ifPresent(old -> save("STAGE_CHANGE",
                "放水阶段：" + stageLabel(old) + " → " + stageLabel(stage), String.join("\n", a.stage().triggers()), today));

        String likelihood = a.likelihood().level().name();
        replaceState(LIKELIHOOD, likelihood).filter(old -> !old.equals(likelihood)).ifPresent(old -> save("LIKELIHOOD_CHANGE",
                "升级可能性：" + LIKELIHOOD_NAMES.getOrDefault(old, old) + " → " + LIKELIHOOD_NAMES.getOrDefault(likelihood, likelihood),
                String.join("\n", a.likelihood().reasons()), today));
    }

    /** Stores the new value and returns the previous one; empty on the very first run, which must not raise an alert. */
    private Optional<String> replaceState(String key, String value) {
        Optional<QeRadarState> existing = stateRepo.findById(key);
        Optional<String> previous = existing.map(QeRadarState::getStateValue);
        QeRadarState row = existing.orElseGet(QeRadarState::new);
        row.setStateKey(key);
        row.setStateValue(value);
        row.setUpdatedAt(LocalDateTime.now(clock));
        stateRepo.save(row);
        return previous;
    }

    private static String stageLabel(String level) {
        try {
            int n = Integer.parseInt(level);
            return "L" + n + " " + QeStageEngine.NAMES[n];
        } catch (RuntimeException e) {
            return level;
        }
    }

    private void save(String type, String title, String detail, LocalDate refDate) {
        QeRadarAlert alert = new QeRadarAlert();
        alert.setAlertType(type);
        alert.setTitle(title);
        alert.setDetail(detail == null || detail.isBlank() ? null : detail.length() > MAX_DETAIL ? detail.substring(0, MAX_DETAIL) : detail);
        alert.setRefDate(refDate);
        alert.setAcknowledged(false);
        alert.setCreatedAt(LocalDateTime.now(clock));
        alertRepo.save(alert);
    }

    // ---- reading and acknowledging (REST) ----

    public List<QeRadarAlert> list(boolean unreadOnly, int limit) {
        PageRequest page = PageRequest.of(0, Math.max(1, Math.min(limit, 200)));
        return unreadOnly ? alertRepo.findByAcknowledgedFalseOrderByIdDesc(page) : alertRepo.findAllByOrderByIdDesc(page);
    }

    public long unreadCount() {
        return alertRepo.countByAcknowledgedFalse();
    }

    @Transactional
    public void acknowledge(Long id) {
        QeRadarAlert alert = alertRepo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "提醒不存在"));
        alert.setAcknowledged(true);
        alertRepo.save(alert);
    }

    @Transactional
    public int acknowledgeAll() {
        return alertRepo.acknowledgeAll();
    }
}
