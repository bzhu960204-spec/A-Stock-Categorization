package com.stockcard.service;

import com.stockcard.entity.ValuationSnapshot;
import com.stockcard.repository.ValuationSnapshotRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
public class ValuationService {

    private final ValuationSnapshotRepository repo;

    public ValuationService(ValuationSnapshotRepository repo) {
        this.repo = repo;
    }

    public List<ValuationSnapshot> list(String ticker) {
        if (ticker != null && !ticker.isBlank()) {
            return repo.findByTickerOrdered(normalizeTicker(ticker));
        }
        return repo.findAllOrdered();
    }

    @Transactional
    public ValuationSnapshot create(ValuationSnapshot snapshot) {
        snapshot.setId(null);
        snapshot.setTicker(normalizeTicker(snapshot.getTicker()));
        return repo.save(snapshot);
    }

    /** Full replacement of the editable fields; id and createdAt are preserved. */
    @Transactional
    public Optional<ValuationSnapshot> update(Long id, ValuationSnapshot snapshot) {
        return repo.findById(id).map(existing -> {
            snapshot.setId(id);
            snapshot.setCreatedAt(existing.getCreatedAt());
            snapshot.setTicker(normalizeTicker(snapshot.getTicker()));
            return repo.save(snapshot);
        });
    }

    @Transactional
    public boolean delete(Long id) {
        if (!repo.existsById(id)) return false;
        repo.deleteById(id);
        return true;
    }

    public List<Map<String, String>> companies() {
        return repo.findCompanies().stream()
                .map(row -> Map.of("ticker", (String) row[0], "companyName", (String) row[1]))
                .toList();
    }

    private static String normalizeTicker(String ticker) {
        return ticker == null ? null : ticker.trim().toUpperCase(Locale.ROOT);
    }
}
