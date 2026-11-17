package com.stockcard.controller;

import com.stockcard.entity.ValuationSnapshot;
import com.stockcard.service.ValuationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/valuations")
public class ValuationController {

    private final ValuationService valuationService;

    public ValuationController(ValuationService valuationService) {
        this.valuationService = valuationService;
    }

    // ── Snapshots ──────────────────────────────────────────────────────────

    @GetMapping("/snapshots")
    public List<ValuationSnapshot> getSnapshots(@RequestParam(required = false) String ticker) {
        return valuationService.list(ticker);
    }

    @PostMapping("/snapshots")
    public ValuationSnapshot create(@Valid @RequestBody ValuationSnapshot snapshot) {
        return valuationService.create(snapshot);
    }

    @PutMapping("/snapshots/{id}")
    public ResponseEntity<ValuationSnapshot> update(@PathVariable Long id,
                                                     @Valid @RequestBody ValuationSnapshot snapshot) {
        return valuationService.update(id, snapshot)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/snapshots/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        return valuationService.delete(id)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    // ── Companies (distinct tickers) ───────────────────────────────────────

    @GetMapping("/companies")
    public List<Map<String, String>> getCompanies() {
        return valuationService.companies();
    }
}
