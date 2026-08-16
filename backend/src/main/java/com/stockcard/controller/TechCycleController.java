package com.stockcard.controller;

import com.stockcard.entity.TechCycle;
import com.stockcard.entity.TechCyclePhase;
import com.stockcard.service.TechCycleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/tech-cycles")
@RequiredArgsConstructor
public class TechCycleController {

    private final TechCycleService techCycleService;

    // ── Tech Cycles ──────────────────────────────────────────────────────────

    @GetMapping
    public List<TechCycle> getAllCycles() {
        return techCycleService.getAllCycles();
    }

    @PostMapping
    public TechCycle createCycle(@RequestBody TechCycle cycle) {
        return techCycleService.createCycle(cycle);
    }

    @PutMapping("/{id}")
    public ResponseEntity<TechCycle> updateCycle(@PathVariable Long id,
                                                  @RequestBody TechCycle details) {
        return techCycleService.updateCycle(id, details)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCycle(@PathVariable Long id) {
        techCycleService.deleteCycle(id);
        return ResponseEntity.ok().build();
    }

    // ── Phases ───────────────────────────────────────────────────────────────

    @GetMapping("/{id}/phases")
    public List<TechCyclePhase> getPhases(@PathVariable Long id) {
        return techCycleService.getPhases(id);
    }

    @PostMapping("/{id}/phases")
    public TechCyclePhase createPhase(@PathVariable Long id,
                                       @RequestBody TechCyclePhase phase) {
        return techCycleService.createPhase(id, phase);
    }

    @PutMapping("/{id}/phases/{phaseId}")
    public ResponseEntity<TechCyclePhase> updatePhase(@PathVariable Long id,
                                                       @PathVariable Long phaseId,
                                                       @RequestBody TechCyclePhase details) {
        return techCycleService.updatePhase(id, phaseId, details)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}/phases/{phaseId}")
    public ResponseEntity<Void> deletePhase(@PathVariable Long id,
                                             @PathVariable Long phaseId) {
        techCycleService.deletePhase(phaseId);
        return ResponseEntity.ok().build();
    }
}
