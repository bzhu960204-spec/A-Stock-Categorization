package com.stockcard.controller;

import com.stockcard.entity.MarketEvent;
import com.stockcard.repository.MarketEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/market-events")
@RequiredArgsConstructor
public class MarketEventController {

    private final MarketEventRepository marketEventRepository;

    /** 查询某月所有事件，例如 GET /api/market-events?year=2026&month=5 */
    @GetMapping
    public List<MarketEvent> getEventsByMonth(
            @RequestParam int year,
            @RequestParam int month) {
        LocalDate start = LocalDate.of(year, month, 1);
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return marketEventRepository.findByEventDateBetweenOrderByEventDateAsc(start, end);
    }

    @PostMapping
    public MarketEvent createEvent(@RequestBody MarketEvent event) {
        return marketEventRepository.save(event);
    }

    @PutMapping("/{id}")
    public ResponseEntity<MarketEvent> updateEvent(@PathVariable Long id,
                                                   @RequestBody MarketEvent details) {
        return marketEventRepository.findById(id)
                .map(event -> {
                    event.setTitle(details.getTitle());
                    event.setEventDate(details.getEventDate());
                    event.setDescription(details.getDescription());
                    event.setCategory(details.getCategory());
                    event.setImportance(details.getImportance());
                    return ResponseEntity.ok(marketEventRepository.save(event));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEvent(@PathVariable Long id) {
        marketEventRepository.deleteById(id);
        return ResponseEntity.ok().build();
    }
}
