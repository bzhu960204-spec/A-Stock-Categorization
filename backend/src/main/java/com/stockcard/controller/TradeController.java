package com.stockcard.controller;

import com.stockcard.entity.Trade;
import com.stockcard.entity.TradeCategory;
import com.stockcard.service.TradeService;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/trades")
@RequiredArgsConstructor
public class TradeController {

    private final TradeService tradeService;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    @Data
    @NoArgsConstructor
    static class CategoryPayload {
        private String name;
    }

    @Data
    @NoArgsConstructor
    static class TradePayload {
        private Long categoryId;
        private String subCategory;
        private String title;
        private String content;
        private Integer rating;
    }

    @Data
    static class TradeDto {
        private Long id;
        private Long categoryId;
        private String categoryName;
        private String subCategory;
        private String title;
        private String content;
        private int rating;
        private String createdAt;
        private String updatedAt;

        static TradeDto from(Trade trade) {
            TradeDto dto = new TradeDto();
            dto.id = trade.getId();
            dto.categoryId = trade.getCategory() != null ? trade.getCategory().getId() : null;
            dto.categoryName = trade.getCategory() != null ? trade.getCategory().getName() : null;
            dto.subCategory = trade.getSubCategory();
            dto.title = trade.getTitle();
            dto.content = trade.getContent();
            dto.rating = trade.getRating();
            dto.createdAt = trade.getCreatedAt() != null ? trade.getCreatedAt().toString() : null;
            dto.updatedAt = trade.getUpdatedAt() != null ? trade.getUpdatedAt().toString() : null;
            return dto;
        }
    }

    // ── Category endpoints ────────────────────────────────────────────────────

    @GetMapping("/categories")
    public List<TradeCategory> getAllCategories() {
        return tradeService.getAllCategories();
    }

    @PostMapping("/categories")
    public ResponseEntity<TradeCategory> createCategory(@RequestBody CategoryPayload payload) {
        if (payload.getName() == null || payload.getName().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return tradeService.createCategory(payload.getName().trim())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(409).build());
    }

    @PutMapping("/categories/{id}")
    public ResponseEntity<TradeCategory> updateCategory(@PathVariable Long id, @RequestBody CategoryPayload payload) {
        return tradeService.updateCategory(id, payload.getName())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/categories/{id}")
    public ResponseEntity<Void> deleteCategory(@PathVariable Long id) {
        return switch (tradeService.deleteCategory(id)) {
            case NOT_FOUND -> ResponseEntity.notFound().build();
            case HAS_TRADES -> ResponseEntity.status(409).build();
            case DELETED -> ResponseEntity.ok().build();
        };
    }

    // ── Trade endpoints ────────────────────────────────────────────────────────

    @GetMapping
    public List<TradeDto> getAllTrades(@RequestParam(required = false) Long categoryId) {
        return tradeService.getAll(categoryId).stream().map(TradeDto::from).collect(Collectors.toList());
    }

    @GetMapping("/search")
    public List<TradeDto> search(@RequestParam String keyword) {
        String kw = keyword.trim().toLowerCase();
        if (kw.isEmpty()) return List.of();
        return tradeService.search("%" + kw + "%").stream().map(TradeDto::from).collect(Collectors.toList());
    }

    @PostMapping
    public ResponseEntity<TradeDto> createTrade(@RequestBody TradePayload payload) {
        if (payload.getTitle() == null || payload.getTitle().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        Trade saved = tradeService.create(payload.getTitle(), payload.getContent(),
                payload.getSubCategory(), payload.getRating(), payload.getCategoryId());
        return ResponseEntity.ok(TradeDto.from(saved));
    }

    @PutMapping("/{id}")
    public ResponseEntity<TradeDto> updateTrade(@PathVariable Long id, @RequestBody TradePayload payload) {
        return tradeService.update(id, payload.getTitle(), payload.getContent(),
                        payload.getSubCategory(), payload.getRating(), payload.getCategoryId())
                .map(trade -> ResponseEntity.ok(TradeDto.from(trade)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @Data
    @NoArgsConstructor
    static class RatingPayload {
        private Integer rating;
    }

    @PatchMapping("/{id}/rating")
    public ResponseEntity<TradeDto> updateRating(@PathVariable Long id, @RequestBody RatingPayload body) {
        if (body.getRating() == null || body.getRating() < 0 || body.getRating() > 5) {
            return ResponseEntity.badRequest().build();
        }
        return tradeService.updateRating(id, body.getRating())
                .map(trade -> ResponseEntity.ok(TradeDto.from(trade)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTrade(@PathVariable Long id) {
        return tradeService.delete(id)
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
    }

}
