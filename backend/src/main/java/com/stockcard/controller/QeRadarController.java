package com.stockcard.controller;

import com.stockcard.entity.QeRadarAlert;
import com.stockcard.service.liquidity.qe.QeEpisodes;
import com.stockcard.service.liquidity.qe.QeRadarAlertService;
import com.stockcard.service.liquidity.qe.QeRadarService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** QE radar endpoints (qe-radar design §5.7). */
@RestController
@RequestMapping("/api/liquidity/qe-radar")
@RequiredArgsConstructor
public class QeRadarController {

    private static final LocalDate HISTORY_START = LocalDate.of(2007, 1, 1);

    private final QeRadarService radarService;
    private final QeRadarAlertService alertService;

    @GetMapping
    public QeRadarService.RadarView current() {
        return radarService.current();
    }

    @GetMapping("/stage-history")
    public List<QeRadarService.Segment> stageHistory(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from) {
        return radarService.stageHistory(from != null ? from : HISTORY_START);
    }

    @GetMapping("/texts")
    public List<QeRadarService.TextSummary> texts(@RequestParam(defaultValue = "50") int limit) {
        return radarService.texts(limit);
    }

    @GetMapping("/texts/{id}")
    public QeRadarService.TextDetail text(@PathVariable Long id) {
        return radarService.text(id);
    }

    @GetMapping("/episodes")
    public List<QeEpisodes.Episode> episodes() {
        return radarService.episodes();
    }

    @GetMapping("/replay/{episodeId}")
    public QeRadarService.Replay replay(@PathVariable String episodeId) {
        return radarService.replay(episodeId);
    }

    @GetMapping("/alerts")
    public List<QeRadarAlert> alerts(@RequestParam(defaultValue = "false") boolean unreadOnly,
                                     @RequestParam(defaultValue = "50") int limit) {
        return alertService.list(unreadOnly, limit);
    }

    @GetMapping("/alerts/unread-count")
    public Map<String, Long> unreadCount() {
        return Map.of("count", alertService.unreadCount());
    }

    @PostMapping("/alerts/{id}/ack")
    public ResponseEntity<Void> acknowledge(@PathVariable Long id) {
        alertService.acknowledge(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/alerts/ack-all")
    public ResponseEntity<Void> acknowledgeAll() {
        alertService.acknowledgeAll();
        return ResponseEntity.noContent().build();
    }
}
