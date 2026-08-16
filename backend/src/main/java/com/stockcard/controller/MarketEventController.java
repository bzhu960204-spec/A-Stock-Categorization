package com.stockcard.controller;

import com.stockcard.entity.MarketEvent;
import com.stockcard.service.MarketEventService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/market-events")
@RequiredArgsConstructor
public class MarketEventController {

    private final MarketEventService marketEventService;

    /** 查询某月所有事件，例如 GET /api/market-events?year=2026&month=5 */
    @GetMapping
    public List<MarketEvent> getEventsByMonth(
            @RequestParam int year,
            @RequestParam int month) {
        return marketEventService.getByMonth(year, month);
    }

    @PostMapping
    public MarketEvent createEvent(@RequestBody MarketEvent event) {
        return marketEventService.create(event);
    }

    @PutMapping("/{id}")
    public ResponseEntity<MarketEvent> updateEvent(@PathVariable Long id,
                                                   @RequestBody MarketEvent details) {
        return marketEventService.update(id, details)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEvent(@PathVariable Long id) {
        marketEventService.delete(id);
        return ResponseEntity.ok().build();
    }
}
