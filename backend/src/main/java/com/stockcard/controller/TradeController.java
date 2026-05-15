package com.stockcard.controller;

import com.stockcard.entity.Trade;
import com.stockcard.entity.TradeCategory;
import com.stockcard.repository.TradeCategoryRepository;
import com.stockcard.repository.TradeRepository;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/trades")
@RequiredArgsConstructor
public class TradeController {

    private final TradeCategoryRepository categoryRepository;
    private final TradeRepository tradeRepository;

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
        return categoryRepository.findAll();
    }

    @PostMapping("/categories")
    public ResponseEntity<TradeCategory> createCategory(@RequestBody CategoryPayload payload) {
        if (payload.getName() == null || payload.getName().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        String name = payload.getName().trim();
        if (categoryRepository.existsByName(name)) {
            return ResponseEntity.status(409).build();
        }
        TradeCategory cat = new TradeCategory();
        cat.setName(name);
        return ResponseEntity.ok(categoryRepository.save(cat));
    }

    @PutMapping("/categories/{id}")
    public ResponseEntity<TradeCategory> updateCategory(@PathVariable Long id, @RequestBody CategoryPayload payload) {
        return categoryRepository.findById(id)
                .map(cat -> {
                    if (payload.getName() != null && !payload.getName().isBlank()) {
                        cat.setName(payload.getName().trim());
                    }
                    return ResponseEntity.ok(categoryRepository.save(cat));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/categories/{id}")
    @Transactional
    public ResponseEntity<Void> deleteCategory(@PathVariable Long id) {
        if (!categoryRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        if (tradeRepository.countByCategoryId(id) > 0) {
            return ResponseEntity.status(409).build();
        }
        categoryRepository.deleteById(id);
        return ResponseEntity.ok().build();
    }

    // ── Trade endpoints ────────────────────────────────────────────────────────

    @GetMapping
    public List<TradeDto> getAllTrades(@RequestParam(required = false) Long categoryId) {
        if (categoryId != null) {
            return tradeRepository.findByCategoryIdOrderByCreatedAtDesc(categoryId)
                    .stream().map(TradeDto::from).collect(Collectors.toList());
        }
        return tradeRepository.findAllByOrderByCreatedAtDesc()
                .stream().map(TradeDto::from).collect(Collectors.toList());
    }

    @GetMapping("/search")
    public List<TradeDto> search(@RequestParam String keyword) {
        String kw = keyword.trim().toLowerCase();
        if (kw.isEmpty()) return List.of();
        return tradeRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(t -> containsIgnoreCase(t.getTitle(), kw) || containsIgnoreCase(t.getContent(), kw))
                .map(TradeDto::from)
                .collect(Collectors.toList());
    }

    @PostMapping
    public ResponseEntity<TradeDto> createTrade(@RequestBody TradePayload payload) {
        if (payload.getTitle() == null || payload.getTitle().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        Trade trade = new Trade();
        trade.setTitle(payload.getTitle().trim());
        trade.setContent(payload.getContent());
        trade.setSubCategory(payload.getSubCategory());
        if (payload.getRating() != null) trade.setRating(Math.max(0, Math.min(5, payload.getRating())));
        if (payload.getCategoryId() != null) {
            categoryRepository.findById(payload.getCategoryId()).ifPresent(trade::setCategory);
        }
        return ResponseEntity.ok(TradeDto.from(tradeRepository.save(trade)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<TradeDto> updateTrade(@PathVariable Long id, @RequestBody TradePayload payload) {
        return tradeRepository.findById(id)
                .map(trade -> {
                    if (payload.getTitle() != null && !payload.getTitle().isBlank()) {
                        trade.setTitle(payload.getTitle().trim());
                    }
                    trade.setContent(payload.getContent());
                    trade.setSubCategory(payload.getSubCategory());
                    if (payload.getRating() != null) trade.setRating(Math.max(0, Math.min(5, payload.getRating())));
                    if (payload.getCategoryId() != null) {
                        categoryRepository.findById(payload.getCategoryId()).ifPresent(trade::setCategory);
                    } else {
                        trade.setCategory(null);
                    }
                    return ResponseEntity.ok(TradeDto.from(tradeRepository.save(trade)));
                })
                .orElse(ResponseEntity.notFound().build());
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
        return tradeRepository.findById(id)
                .map(trade -> {
                    trade.setRating(body.getRating());
                    return ResponseEntity.ok(TradeDto.from(tradeRepository.save(trade)));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTrade(@PathVariable Long id) {
        return tradeRepository.findById(id)
                .map(trade -> {
                    tradeRepository.delete(trade);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static boolean containsIgnoreCase(String text, String kw) {
        return text != null && text.toLowerCase().contains(kw);
    }
}
