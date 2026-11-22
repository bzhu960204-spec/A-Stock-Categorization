package com.stockcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.stockcard.entity.MvFactsetReport;
import com.stockcard.entity.MvManualSeries;
import com.stockcard.repository.MvFactsetReportRepository;
import com.stockcard.service.liquidity.SeriesPoint;
import com.stockcard.service.marketvaluation.FetchMode;
import com.stockcard.service.marketvaluation.MvCalcService;
import com.stockcard.service.marketvaluation.MvDashboardService;
import com.stockcard.service.marketvaluation.MvDecompositionService;
import com.stockcard.service.marketvaluation.MvManualService;
import com.stockcard.service.marketvaluation.MvMarketService;
import com.stockcard.service.marketvaluation.MvSource;
import com.stockcard.service.marketvaluation.MvStatsService;
import com.stockcard.service.marketvaluation.MvSyncService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
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
@RequestMapping("/api/market-valuation")
@RequiredArgsConstructor
public class MarketValuationController {

    private static final int MAX_SERIES = 12;
    private static final int MAX_REPORTS = 200;

    private final MvManualService manualService;
    private final MvCalcService calcService;
    private final MvStatsService statsService;
    private final MvDashboardService dashboardService;
    private final MvMarketService marketService;
    private final MvDecompositionService decompositionService;
    private final MvSyncService syncService;
    private final MvFactsetReportRepository factsetRepo;

    // ---- catalog / dashboard / series ----

    @GetMapping("/catalog")
    public List<MvManualService.CatalogEntry> catalog() {
        return manualService.catalog();
    }

    @GetMapping("/dashboard")
    public MvDashboardService.Dashboard dashboard(@RequestParam(required = false) String window) {
        return dashboardService.dashboard(window);
    }

    /**
     * GET /series?codes=A,B&from=&to=&window= — {@code {"series": {"A": [["2026-11-20", 36.44], ...]}, "stats": {"A": {...}}}};
     * {@code from} defaults to ten years ago, {@code stats} (ranked against the code's history baseline) only when {@code window} is given.
     */
    @GetMapping("/series")
    public Map<String, Object> series(@RequestParam String codes,
                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                      @RequestParam(required = false) String window) {
        Set<String> codeSet = new LinkedHashSet<>(Arrays.stream(codes.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList());
        if (codeSet.isEmpty()) throw new IllegalArgumentException("codes 不能为空");
        if (codeSet.size() > MAX_SERIES) throw new IllegalArgumentException("codes 最多 " + MAX_SERIES + " 个");
        LocalDate end = to != null ? to : LocalDate.now();
        LocalDate start = from != null ? from : end.minusYears(10);
        if (start.isAfter(end)) throw new IllegalArgumentException("from 不能晚于 to");
        MvStatsService.Window win = window == null || window.isBlank() ? null : MvStatsService.Window.parse(window);

        MvCalcService.Session session = calcService.session();
        Map<String, List<Object[]>> series = new LinkedHashMap<>();
        Map<String, MvStatsService.Stats> stats = new LinkedHashMap<>();
        for (String code : codeSet) {
            List<SeriesPoint> points = session.get(code, start).stream().filter(p -> !p.date().isAfter(end)).toList();
            List<Object[]> rows = new ArrayList<>(points.size());
            for (SeriesPoint p : points) rows.add(new Object[]{p.date().toString(), p.value()});
            series.put(code, rows);
            if (win != null) {
                SeriesPoint last = MvCalcService.last(points);
                stats.put(code, last == null ? null : statsService.statsFor(session, code, last.date(), win));
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("series", series);
        if (win != null) out.put("stats", stats);
        return out;
    }

    @GetMapping("/markets")
    public List<MvMarketService.MarketRow> markets(@RequestParam(required = false) String window) {
        return marketService.markets();
    }

    @GetMapping("/decomposition")
    public List<MvDecompositionService.Row> decomposition() {
        return decompositionService.decomposition();
    }

    @GetMapping("/scatter/pb-roe")
    public List<MvMarketService.ScatterPoint> scatter() {
        return marketService.scatterPbRoe();
    }

    // ---- sync ----

    @PostMapping("/sync")
    public ResponseEntity<Map<String, String>> sync(@RequestParam(defaultValue = "INCREMENTAL") FetchMode mode,
                                                    @RequestParam(required = false) MvSource source) {
        syncService.triggerAsync(mode, source);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("status", "started", "mode", mode.name()));
    }

    @PostMapping("/refresh-if-stale")
    public MvSyncService.RefreshResult refreshIfStale() {
        return syncService.refreshIfStale();
    }

    @GetMapping("/sync/status")
    public Map<String, Object> syncStatus() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("running", syncService.isRunning());
        status.put("current", syncService.currentProgress());
        status.put("lastLogs", syncService.recentLogs());
        return status;
    }

    @GetMapping("/factset/reports")
    public Map<String, Object> factsetReports(@RequestParam(defaultValue = "30") int limit) {
        if (limit < 1 || limit > MAX_REPORTS) throw new IllegalArgumentException("limit 必须在 1 到 " + MAX_REPORTS + " 之间");
        List<MvFactsetReport> reports = factsetRepo.findAllByOrderByWeekFridayDesc(PageRequest.of(0, limit));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reports", reports);
        out.putAll(syncService.factsetProgress());
        return out;
    }

    @PostMapping("/factset/reports/{weekFriday}/retry")
    public ResponseEntity<Map<String, String>> retryFactsetWeek(
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekFriday) {
        syncService.retryFactsetWeek(weekFriday);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("status", "started"));
    }

    // ---- manual series ----

    public record ManualSeriesRequest(@NotNull String code, @NotNull String name, @NotNull String unit, String description) {}

    @GetMapping("/manual-series")
    public List<MvManualSeries> manualSeries() {
        return manualService.list();
    }

    @PostMapping("/manual-series")
    public MvManualSeries createManualSeries(@Valid @RequestBody ManualSeriesRequest request) {
        return manualService.create(request.code(), request.name(), request.unit(), request.description());
    }

    @DeleteMapping("/manual-series/{code}")
    public ResponseEntity<Void> deleteManualSeries(@PathVariable String code) {
        manualService.delete(code);
        return ResponseEntity.noContent().build();
    }

    /** Body: {@code {"date": "2026-11-20", "value": 14.9}} or an array of such objects. Same date overwrites. */
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
