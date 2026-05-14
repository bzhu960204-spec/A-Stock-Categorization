package com.stockcard.controller;

import com.stockcard.entity.TechCycle;
import com.stockcard.entity.TechCyclePhase;
import com.stockcard.repository.TechCyclePhaseRepository;
import com.stockcard.repository.TechCycleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/tech-cycles")
@RequiredArgsConstructor
public class TechCycleController {

    private final TechCycleRepository techCycleRepository;
    private final TechCyclePhaseRepository techCyclePhaseRepository;

    // ── Tech Cycles ──────────────────────────────────────────────────────────

    @GetMapping
    public List<TechCycle> getAllCycles() {
        return techCycleRepository.findAll();
    }

    @PostMapping
    public TechCycle createCycle(@RequestBody TechCycle cycle) {
        return techCycleRepository.save(cycle);
    }

    @PutMapping("/{id}")
    public ResponseEntity<TechCycle> updateCycle(@PathVariable Long id,
                                                  @RequestBody TechCycle details) {
        return techCycleRepository.findById(id).map(c -> {
            c.setName(details.getName());
            c.setDescription(details.getDescription());
            c.setColor(details.getColor());
            return ResponseEntity.ok(techCycleRepository.save(c));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> deleteCycle(@PathVariable Long id) {
        techCyclePhaseRepository.deleteByTechCycleId(id);
        techCycleRepository.deleteById(id);
        return ResponseEntity.ok().build();
    }

    // ── Phases ───────────────────────────────────────────────────────────────

    @GetMapping("/{id}/phases")
    public List<TechCyclePhase> getPhases(@PathVariable Long id) {
        return techCyclePhaseRepository.findByTechCycleIdOrderBySortOrderAscStartYearAsc(id);
    }

    @PostMapping("/{id}/phases")
    public TechCyclePhase createPhase(@PathVariable Long id,
                                       @RequestBody TechCyclePhase phase) {
        phase.setTechCycleId(id);
        return techCyclePhaseRepository.save(phase);
    }

    @PutMapping("/{id}/phases/{phaseId}")
    public ResponseEntity<TechCyclePhase> updatePhase(@PathVariable Long id,
                                                       @PathVariable Long phaseId,
                                                       @RequestBody TechCyclePhase details) {
        return techCyclePhaseRepository.findById(phaseId).map(p -> {
            if (!p.getTechCycleId().equals(id)) return ResponseEntity.notFound().<TechCyclePhase>build();
            p.setTitle(details.getTitle());
            p.setPhaseType(details.getPhaseType());
            p.setStartYear(details.getStartYear());
            p.setStartQuarter(details.getStartQuarter());
            p.setEndYear(details.getEndYear());
            p.setEndQuarter(details.getEndQuarter());
            p.setNotes(details.getNotes());
            p.setSortOrder(details.getSortOrder());
            return ResponseEntity.ok(techCyclePhaseRepository.save(p));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}/phases/{phaseId}")
    public ResponseEntity<Void> deletePhase(@PathVariable Long id,
                                             @PathVariable Long phaseId) {
        techCyclePhaseRepository.deleteById(phaseId);
        return ResponseEntity.ok().build();
    }
}
