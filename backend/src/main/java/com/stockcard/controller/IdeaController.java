package com.stockcard.controller;

import com.stockcard.entity.Idea;
import com.stockcard.entity.IdeaAttachment;
import com.stockcard.entity.IdeaCategory;
import com.stockcard.entity.IdeaComment;
import com.stockcard.repository.IdeaAttachmentRepository;
import com.stockcard.repository.IdeaCategoryRepository;
import com.stockcard.repository.IdeaCommentRepository;
import com.stockcard.repository.IdeaRepository;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/ideas")
@RequiredArgsConstructor
public class IdeaController {

    private final IdeaCategoryRepository categoryRepository;
    private final IdeaRepository ideaRepository;
    private final IdeaAttachmentRepository attachmentRepository;
    private final IdeaCommentRepository commentRepository;

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
    @Transactional
    public ResponseEntity<Void> deleteIdea(@PathVariable Long id) {
        return ideaRepository.findById(id)
                .map(idea -> {
                    commentRepository.deleteByIdeaId(id);
                    attachmentRepository.deleteByIdeaId(id);
                    ideaRepository.delete(idea);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // ── Attachment endpoints ──────────────────────────────────────────────────

    @Data
    static class AttachmentDto {
        private Long id;
        private Long ideaId;
        private String fileName;
        private String contentType;
        private Long fileSize;
        private String createdAt;

        static AttachmentDto from(IdeaAttachment a) {
            AttachmentDto dto = new AttachmentDto();
            dto.id = a.getId();
            dto.ideaId = a.getIdeaId();
            dto.fileName = a.getFileName();
            dto.contentType = a.getContentType();
            dto.fileSize = a.getFileSize();
            dto.createdAt = a.getCreatedAt() != null ? a.getCreatedAt().toString() : null;
            return dto;
        }
    }

    @GetMapping("/{ideaId}/attachments")
    public ResponseEntity<List<AttachmentDto>> listAttachments(@PathVariable Long ideaId) {
        if (!ideaRepository.existsById(ideaId)) {
            return ResponseEntity.notFound().build();
        }
        List<AttachmentDto> list = attachmentRepository.findByIdeaIdOrderByCreatedAtDesc(ideaId)
                .stream().map(AttachmentDto::from).collect(Collectors.toList());
        return ResponseEntity.ok(list);
    }

    @PostMapping(value = "/{ideaId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<AttachmentDto> uploadAttachment(
            @PathVariable Long ideaId,
            @RequestParam("file") MultipartFile file) throws IOException {
        if (!ideaRepository.existsById(ideaId)) {
            return ResponseEntity.notFound().build();
        }
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        IdeaAttachment attachment = new IdeaAttachment();
        attachment.setIdeaId(ideaId);
        attachment.setFileName(file.getOriginalFilename() != null ? file.getOriginalFilename() : "unnamed");
        attachment.setContentType(file.getContentType() != null ? file.getContentType() : "application/octet-stream");
        attachment.setFileSize(file.getSize());
        attachment.setData(file.getBytes());
        IdeaAttachment saved = attachmentRepository.save(attachment);
        return ResponseEntity.ok(AttachmentDto.from(saved));
    }

    @GetMapping("/{ideaId}/attachments/{attachmentId}/download")
    public ResponseEntity<byte[]> downloadAttachment(
            @PathVariable Long ideaId,
            @PathVariable Long attachmentId) {
        return attachmentRepository.findById(attachmentId)
                .filter(a -> a.getIdeaId().equals(ideaId))
                .map(a -> ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + a.getFileName() + "\"")
                        .contentType(MediaType.parseMediaType(a.getContentType()))
                        .contentLength(a.getFileSize())
                        .body(a.getData()))
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{ideaId}/attachments/{attachmentId}")
    @Transactional
    public ResponseEntity<Void> deleteAttachment(
            @PathVariable Long ideaId,
            @PathVariable Long attachmentId) {
        return attachmentRepository.findById(attachmentId)
                .filter(a -> a.getIdeaId().equals(ideaId))
                .map(a -> {
                    attachmentRepository.delete(a);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // ── Comment endpoints ─────────────────────────────────────────────────────

    @Data
    @NoArgsConstructor
    static class CommentPayload {
        private String content;
    }

    @Data
    static class CommentDto {
        private Long id;
        private Long ideaId;
        private String content;
        private String createdAt;
        private String updatedAt;

        static CommentDto from(IdeaComment c) {
            CommentDto dto = new CommentDto();
            dto.id = c.getId();
            dto.ideaId = c.getIdeaId();
            dto.content = c.getContent();
            dto.createdAt = c.getCreatedAt() != null ? c.getCreatedAt().toString() : null;
            dto.updatedAt = c.getUpdatedAt() != null ? c.getUpdatedAt().toString() : null;
            return dto;
        }
    }

    @GetMapping("/{ideaId}/comments")
    public ResponseEntity<List<CommentDto>> listComments(@PathVariable Long ideaId) {
        if (!ideaRepository.existsById(ideaId)) {
            return ResponseEntity.notFound().build();
        }
        List<CommentDto> list = commentRepository.findByIdeaIdOrderByCreatedAtAsc(ideaId)
                .stream().map(CommentDto::from).collect(Collectors.toList());
        return ResponseEntity.ok(list);
    }

    @PostMapping("/{ideaId}/comments")
    public ResponseEntity<CommentDto> createComment(
            @PathVariable Long ideaId,
            @RequestBody CommentPayload payload) {
        if (!ideaRepository.existsById(ideaId)) {
            return ResponseEntity.notFound().build();
        }
        if (payload.getContent() == null || payload.getContent().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        IdeaComment comment = new IdeaComment();
        comment.setIdeaId(ideaId);
        comment.setContent(payload.getContent());
        return ResponseEntity.ok(CommentDto.from(commentRepository.save(comment)));
    }

    @PutMapping("/{ideaId}/comments/{commentId}")
    public ResponseEntity<CommentDto> updateComment(
            @PathVariable Long ideaId,
            @PathVariable Long commentId,
            @RequestBody CommentPayload payload) {
        return commentRepository.findById(commentId)
                .filter(c -> c.getIdeaId().equals(ideaId))
                .map(c -> {
                    if (payload.getContent() != null && !payload.getContent().isBlank()) {
                        c.setContent(payload.getContent());
                    }
                    return ResponseEntity.ok(CommentDto.from(commentRepository.save(c)));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{ideaId}/comments/{commentId}")
    @Transactional
    public ResponseEntity<Void> deleteComment(
            @PathVariable Long ideaId,
            @PathVariable Long commentId) {
        return commentRepository.findById(commentId)
                .filter(c -> c.getIdeaId().equals(ideaId))
                .map(c -> {
                    commentRepository.delete(c);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static boolean containsIgnoreCase(String text, String kw) {
        return text != null && text.toLowerCase().contains(kw);
    }
}
