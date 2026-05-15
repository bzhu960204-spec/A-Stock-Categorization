package com.stockcard.controller;

import com.stockcard.entity.Idea;
import com.stockcard.entity.IdeaCategory;
import com.stockcard.repository.IdeaCategoryRepository;
import com.stockcard.repository.IdeaRepository;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/ideas")
@RequiredArgsConstructor
public class IdeaController {

    private final IdeaCategoryRepository categoryRepository;
    private final IdeaRepository ideaRepository;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    @Data
    @NoArgsConstructor
    static class CategoryPayload {
        private String name;
    }

    @Data
    @NoArgsConstructor
    static class IdeaPayload {
        private Long categoryId;
        private String subCategory;
        private String title;
        private String content;
        private Integer rating;
    }

    @Data
    static class IdeaDto {
        private Long id;
        private Long categoryId;
        private String categoryName;
        private String subCategory;
        private String title;
        private String content;
        private int rating;
        private String createdAt;
        private String updatedAt;

        static IdeaDto from(Idea idea) {
            IdeaDto dto = new IdeaDto();
            dto.id = idea.getId();
            dto.categoryId = idea.getCategory() != null ? idea.getCategory().getId() : null;
            dto.categoryName = idea.getCategory() != null ? idea.getCategory().getName() : null;
            dto.subCategory = idea.getSubCategory();
            dto.title = idea.getTitle();
            dto.content = idea.getContent();
            dto.rating = idea.getRating();
            dto.createdAt = idea.getCreatedAt() != null ? idea.getCreatedAt().toString() : null;
            dto.updatedAt = idea.getUpdatedAt() != null ? idea.getUpdatedAt().toString() : null;
            return dto;
        }
    }

    // ── Category endpoints ────────────────────────────────────────────────────

    @GetMapping("/categories")
    public List<IdeaCategory> getAllCategories() {
        return categoryRepository.findAll();
    }

    @PostMapping("/categories")
    public ResponseEntity<IdeaCategory> createCategory(@RequestBody CategoryPayload payload) {
        if (payload.getName() == null || payload.getName().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        String name = payload.getName().trim();
        if (categoryRepository.existsByName(name)) {
            return ResponseEntity.status(409).build();
        }
        IdeaCategory cat = new IdeaCategory();
        cat.setName(name);
        return ResponseEntity.ok(categoryRepository.save(cat));
    }

    @PutMapping("/categories/{id}")
    public ResponseEntity<IdeaCategory> updateCategory(@PathVariable Long id, @RequestBody CategoryPayload payload) {
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
        if (ideaRepository.countByCategoryId(id) > 0) {
            return ResponseEntity.status(409).build();
        }
        categoryRepository.deleteById(id);
        return ResponseEntity.ok().build();
    }

    // ── Idea endpoints ────────────────────────────────────────────────────────

    @GetMapping
    public List<IdeaDto> getAllIdeas(@RequestParam(required = false) Long categoryId) {
        if (categoryId != null) {
            return ideaRepository.findByCategoryIdOrderByCreatedAtDesc(categoryId)
                    .stream().map(IdeaDto::from).collect(Collectors.toList());
        }
        return ideaRepository.findAllByOrderByCreatedAtDesc()
                .stream().map(IdeaDto::from).collect(Collectors.toList());
    }

    @GetMapping("/search")
    public List<IdeaDto> search(@RequestParam String keyword) {
        String kw = keyword.trim().toLowerCase();
        if (kw.isEmpty()) return List.of();
        return ideaRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(i -> containsIgnoreCase(i.getTitle(), kw) || containsIgnoreCase(i.getContent(), kw))
                .map(IdeaDto::from)
                .collect(Collectors.toList());
    }

    @PostMapping
    public ResponseEntity<IdeaDto> createIdea(@RequestBody IdeaPayload payload) {
        if (payload.getTitle() == null || payload.getTitle().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        Idea idea = new Idea();
        idea.setTitle(payload.getTitle().trim());
        idea.setContent(payload.getContent());
        idea.setSubCategory(payload.getSubCategory());
        if (payload.getRating() != null) idea.setRating(Math.max(0, Math.min(5, payload.getRating())));
        if (payload.getCategoryId() != null) {
            categoryRepository.findById(payload.getCategoryId()).ifPresent(idea::setCategory);
        }
        return ResponseEntity.ok(IdeaDto.from(ideaRepository.save(idea)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<IdeaDto> updateIdea(@PathVariable Long id, @RequestBody IdeaPayload payload) {
        return ideaRepository.findById(id)
                .map(idea -> {
                    if (payload.getTitle() != null && !payload.getTitle().isBlank()) {
                        idea.setTitle(payload.getTitle().trim());
                    }
                    idea.setContent(payload.getContent());
                    idea.setSubCategory(payload.getSubCategory());
                    if (payload.getRating() != null) idea.setRating(Math.max(0, Math.min(5, payload.getRating())));
                    if (payload.getCategoryId() != null) {
                        categoryRepository.findById(payload.getCategoryId()).ifPresent(idea::setCategory);
                    } else {
                        idea.setCategory(null);
                    }
                    return ResponseEntity.ok(IdeaDto.from(ideaRepository.save(idea)));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @Data
    @NoArgsConstructor
    static class RatingPayload {
        private Integer rating;
    }

    @PatchMapping("/{id}/rating")
    public ResponseEntity<IdeaDto> updateRating(@PathVariable Long id, @RequestBody RatingPayload body) {
        if (body.getRating() == null || body.getRating() < 0 || body.getRating() > 5) {
            return ResponseEntity.badRequest().build();
        }
        return ideaRepository.findById(id)
                .map(idea -> {
                    idea.setRating(body.getRating());
                    return ResponseEntity.ok(IdeaDto.from(ideaRepository.save(idea)));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteIdea(@PathVariable Long id) {
        return ideaRepository.findById(id)
                .map(idea -> {
                    ideaRepository.delete(idea);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static boolean containsIgnoreCase(String text, String kw) {
        return text != null && text.toLowerCase().contains(kw);
    }
}
