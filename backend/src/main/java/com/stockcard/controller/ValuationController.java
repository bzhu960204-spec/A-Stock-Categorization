package com.stockcard.controller;

import com.stockcard.entity.ValuationSnapshot;
import com.stockcard.repository.ValuationSnapshotRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/valuations")
public class ValuationController {

    @Autowired
    private ValuationSnapshotRepository repo;

    // ── Snapshots ──────────────────────────────────────────────────────────

    @GetMapping("/snapshots")
    public List<ValuationSnapshot> getSnapshots(@RequestParam(required = false) String ticker) {
        if (ticker != null && !ticker.isBlank()) {
            return repo.findByTickerOrdered(ticker.toUpperCase());
        }
        return repo.findAllOrdered();
    }

    @PostMapping("/snapshots")
    public ValuationSnapshot create(@RequestBody ValuationSnapshot snapshot) {
        snapshot.setId(null);
        if (snapshot.getTicker() != null) {
            snapshot.setTicker(snapshot.getTicker().trim().toUpperCase());
        }
        return repo.save(snapshot);
    }

    @PutMapping("/snapshots/{id}")
    public ResponseEntity<ValuationSnapshot> update(@PathVariable Long id,
                                                     @RequestBody ValuationSnapshot snapshot) {
        return repo.findById(id).map(existing -> {
            snapshot.setId(id);
            snapshot.setCreatedAt(existing.getCreatedAt());
            if (snapshot.getTicker() != null) {
                snapshot.setTicker(snapshot.getTicker().trim().toUpperCase());
            }
            return ResponseEntity.ok(repo.save(snapshot));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/snapshots/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!repo.existsById(id)) return ResponseEntity.notFound().build();
        repo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    // ── Companies (distinct tickers) ───────────────────────────────────────

    @GetMapping("/companies")
    public List<Map<String, String>> getCompanies() {
        List<ValuationSnapshot> all = repo.findAll();
        // Keep first encountered companyName per ticker; sort by ticker alphabetically
        LinkedHashMap<String, String> seen = new LinkedHashMap<>();
        all.stream()
           .sorted(Comparator.comparing(ValuationSnapshot::getTicker))
           .forEach(v -> seen.putIfAbsent(v.getTicker(), v.getCompanyName()));
        return seen.entrySet().stream()
                .map(e -> Map.of("ticker", e.getKey(), "companyName", e.getValue()))
                .collect(Collectors.toList());
    }
}
