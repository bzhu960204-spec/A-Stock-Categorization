package com.stockcard.service;

import com.stockcard.entity.TechCycle;
import com.stockcard.entity.TechCyclePhase;
import com.stockcard.repository.TechCyclePhaseRepository;
import com.stockcard.repository.TechCycleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class TechCycleService {

    private final TechCycleRepository techCycleRepository;
    private final TechCyclePhaseRepository techCyclePhaseRepository;

    // ── Cycles ────────────────────────────────────────────────────────────────

    public List<TechCycle> getAllCycles() {
        return techCycleRepository.findAll();
    }

    public TechCycle createCycle(TechCycle cycle) {
        return techCycleRepository.save(cycle);
    }

    public Optional<TechCycle> updateCycle(Long id, TechCycle details) {
        return techCycleRepository.findById(id).map(c -> {
            c.setName(details.getName());
            c.setDescription(details.getDescription());
            c.setColor(details.getColor());
            return techCycleRepository.save(c);
        });
    }

    @Transactional
    public void deleteCycle(Long id) {
        techCyclePhaseRepository.deleteByTechCycleId(id);
        techCycleRepository.deleteById(id);
    }

    // ── Phases ────────────────────────────────────────────────────────────────

    public List<TechCyclePhase> getPhases(Long cycleId) {
        return techCyclePhaseRepository.findByTechCycleIdOrderBySortOrderAscStartYearAsc(cycleId);
    }

    public TechCyclePhase createPhase(Long cycleId, TechCyclePhase phase) {
        phase.setTechCycleId(cycleId);
        return techCyclePhaseRepository.save(phase);
    }

    public Optional<TechCyclePhase> updatePhase(Long cycleId, Long phaseId, TechCyclePhase details) {
        return techCyclePhaseRepository.findById(phaseId)
                .filter(p -> p.getTechCycleId().equals(cycleId))
                .map(p -> {
                    p.setTitle(details.getTitle());
                    p.setPhaseType(details.getPhaseType());
                    p.setStartYear(details.getStartYear());
                    p.setStartQuarter(details.getStartQuarter());
                    p.setEndYear(details.getEndYear());
                    p.setEndQuarter(details.getEndQuarter());
                    p.setNotes(details.getNotes());
                    p.setSortOrder(details.getSortOrder());
                    return techCyclePhaseRepository.save(p);
                });
    }

    public void deletePhase(Long phaseId) {
        techCyclePhaseRepository.deleteById(phaseId);
    }
}
