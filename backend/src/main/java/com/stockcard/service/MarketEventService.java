package com.stockcard.service;

import com.stockcard.entity.MarketEvent;
import com.stockcard.repository.MarketEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class MarketEventService {

    private final MarketEventRepository marketEventRepository;

    public List<MarketEvent> getByMonth(int year, int month) {
        LocalDate start = LocalDate.of(year, month, 1);
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return marketEventRepository.findByEventDateBetweenOrderByEventDateAsc(start, end);
    }

    public MarketEvent create(MarketEvent event) {
        return marketEventRepository.save(event);
    }

    public Optional<MarketEvent> update(Long id, MarketEvent details) {
        return marketEventRepository.findById(id).map(event -> {
            event.setTitle(details.getTitle());
            event.setEventDate(details.getEventDate());
            event.setDescription(details.getDescription());
            event.setCategory(details.getCategory());
            event.setImportance(details.getImportance());
            return marketEventRepository.save(event);
        });
    }

    public void delete(Long id) {
        marketEventRepository.deleteById(id);
    }
}
