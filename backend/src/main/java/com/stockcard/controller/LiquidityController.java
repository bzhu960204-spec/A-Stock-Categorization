package com.stockcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.stockcard.entity.LiquidityManualSeries;
import com.stockcard.service.liquidity.LiquidityCalcService;
import com.stockcard.service.liquidity.LiquidityDashboardService;
import com.stockcard.service.liquidity.LiquidityManualService;
import com.stockcard.service.liquidity.LiquiditySource;
import com.stockcard.service.liquidity.LiquiditySyncService;
import com.stockcard.service.liquidity.LiquidityThresholdService;
import com.stockcard.service.liquidity.LiquidityWeeklyService;
import com.stockcard.service.liquidity.SeriesPoint;
import com.stockcard.service.liquidity.ThresholdRule;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/liquidity")
@RequiredArgsConstructor
public class LiquidityController {

    private static final int MAX_SERIES = 12;
    private static final LocalDate SCATTER_START = LocalDate.of(2018, 4, 1);

    private final LiquidityManualService manualService;
    private final LiquidityCalcService calcService;
    private final LiquidityDashboardService dashboardService;
    private final LiquidityWeeklyService weeklyService;
    private final LiquiditySyncService syncService;
    private final LiquidityThresholdService thresholdService;

    // ---- catalog / dashboard / series ----

    @GetMapping("/catalog")
    public List<LiquidityManualService.CatalogEntry> catalog() {
        return manualService.catalog();
    }

    @GetMapping("/dashboard")
    public LiquidityDashboardService.Dashboard dashboard() {
        return dashboardService.dashboard();
    }

    /** GET /series?codes=A,B&from=&to= — {@code {"A": [["2026-11-19", 3.91], ...]}}; from defaults to one year ago. */
    @GetMapping("/series")
    public Map<String, List<Object[]>> series(@RequestParam String codes,
                                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        Set<String> codeSet = new LinkedHashSet<>(Arrays.stream(codes.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList());
        if (codeSet.isEmpty()) throw new IllegalArgumentException("codes 不能为空");
        if (codeSet.size() > MAX_SERIES) throw new IllegalArgumentException("codes 最多 " + MAX_SERIES + " 个");
        LocalDate end = to != null ? to : LocalDate.now();
        LocalDate start = from != null ? from : end.minusYears(1);
        if (start.isAfter(end)) throw new IllegalArgumentException("from 不能晚于 to");

        Map<String, List<Object[]>> out = new LinkedHashMap<>();
        calcService.getSeries(codeSet, start, end).forEach((code, points) -> {
            List<Object[]> rows = new ArrayList<>(points.size());
            for (SeriesPoint p : points) rows.add(new Object[]{p.date().toString(), p.value()});
            out.put(code, rows);
        });
        return out;
    }

    @GetMapping("/scatter")
    public List<LiquidityCalcService.ScatterPoint> scatter(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from) {
        return calcService.scatter(from != null ? from : SCATTER_START, LocalDate.now());
    }

    // ---- weekly report ----

    public record SnapshotRequest(@NotNull LocalDate weekEnd, String commentary) {}

    public record CommentaryRequest(String commentary) {}

    @GetMapping("/weekly")
    public LiquidityWeeklyService.WeeklyReport weekly(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekEnd) {
        return weeklyService.report(weekEnd);
    }

    @GetMapping("/weekly/snapshots")
    public List<LiquidityWeeklyService.SnapshotSummary> snapshots() {
        return weeklyService.listSnapshots();
    }

    @GetMapping("/weekly/snapshots/{id}")
    public LiquidityWeeklyService.SnapshotDetail snapshot(@PathVariable Long id) {
        return weeklyService.getSnapshot(id);
    }

    @PostMapping("/weekly/snapshots")
    public LiquidityWeeklyService.SnapshotDetail saveSnapshot(@Valid @RequestBody SnapshotRequest request) {
        return weeklyService.saveSnapshot(request.weekEnd(), request.commentary());
    }

    @PutMapping("/weekly/snapshots/{id}")
    public LiquidityWeeklyService.SnapshotDetail updateSnapshot(@PathVariable Long id, @RequestBody CommentaryRequest request) {
        return weeklyService.updateCommentary(id, request.commentary());
    }

    @DeleteMapping("/weekly/snapshots/{id}")
    public ResponseEntity<Void> deleteSnapshot(@PathVariable Long id) {
        weeklyService.deleteSnapshot(id);
        return ResponseEntity.noContent().build();
    }

    // ---- sync ----

    @PostMapping("/sync")
    public ResponseEntity<Map<String, String>> sync(@RequestParam(defaultValue = "INCREMENTAL") LiquiditySyncService.Mode mode,
                                                    @RequestParam(required = false) LiquiditySource source) {
        syncService.triggerAsync(mode, source);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("status", "started", "mode", mode.name()));
    }

    @GetMapping("/sync/status")
    public Map<String, Object> syncStatus() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("running", syncService.isRunning());
        status.put("current", syncService.currentProgress());
        status.put("lastLogs", syncService.recentLogs());
        return status;
    }

    // ---- thresholds ----

    public record ThresholdRequest(@NotNull ThresholdRule.Direction direction, @NotNull Double yellow, @NotNull Double red,
                                   @NotNull Boolean enabled) {}

    @GetMapping("/thresholds")
    public List<LiquidityThresholdService.ThresholdView> thresholds() {
        return thresholdService.list();
    }

    @PutMapping("/thresholds/{code}")
    public ThresholdRule saveThreshold(@PathVariable String code, @Valid @RequestBody ThresholdRequest request) {
        return thresholdService.save(code, request.direction(), request.yellow(), request.red(), request.enabled());
    }

    @DeleteMapping("/thresholds/{code}")
    public ResponseEntity<Void> resetThreshold(@PathVariable String code) {
        thresholdService.reset(code);
        return ResponseEntity.noContent().build();
    }

    // ---- manual series ----

    public record ManualSeriesRequest(@NotNull String code, @NotNull String name, @NotNull String unit, String description) {}

    @GetMapping("/manual-series")
    public List<LiquidityManualSeries> manualSeries() {
        return manualService.list();
    }

    @PostMapping("/manual-series")
    public LiquidityManualSeries createManualSeries(@Valid @RequestBody ManualSeriesRequest request) {
        return manualService.create(request.code(), request.name(), request.unit(), request.description());
    }

    @DeleteMapping("/manual-series/{code}")
    public ResponseEntity<Void> deleteManualSeries(@PathVariable String code) {
        manualService.delete(code);
        return ResponseEntity.noContent().build();
    }

    /** Body: {@code {"date": "2026-11-19", "value": 257}} or an array of such objects. Same date overwrites. */
    @PostMapping("/manual-series/{code}/observations")
    public Map<String, Integer> saveObservations(@PathVariable String code, @RequestBody JsonNode body) {
        List<SeriesPoint> points = new ArrayList<>();
        if (body.isArray()) {
            body.forEach(n -> points.add(toPoint(n)));
        } else {
            points.add(toPoint(body));
        }
        return Map.of("saved", manualService.upsertObservations(code, points));
    }

    @DeleteMapping("/manual-series/{code}/observations/{date}")
    public ResponseEntity<Void> deleteObservation(@PathVariable String code,
                                                  @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        manualService.deleteObservation(code, date);
        return ResponseEntity.noContent().build();
    }

    private static SeriesPoint toPoint(JsonNode n) {
        JsonNode date = n.get("date");
        JsonNode value = n.get("value");
        if (date == null || !date.isTextual()) throw new IllegalArgumentException("date 必须是 YYYY-MM-DD");
        if (value == null || !value.isNumber()) throw new IllegalArgumentException("value 必须是数字");
        return new SeriesPoint(LocalDate.parse(date.asText()), value.doubleValue());
    }
}
