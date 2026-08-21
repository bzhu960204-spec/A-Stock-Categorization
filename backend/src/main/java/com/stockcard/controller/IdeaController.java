package com.stockcard.controller;

import com.stockcard.entity.Idea;
import com.stockcard.entity.IdeaAttachment;
import com.stockcard.entity.IdeaCategory;
import com.stockcard.entity.IdeaComment;
import com.stockcard.service.IdeaService;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/ideas")
@RequiredArgsConstructor
public class IdeaController {

    private final IdeaService ideaService;

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
        private boolean archived;
        private String archivedAt;
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
            dto.archived = idea.isArchived();
            dto.archivedAt = idea.getArchivedAt() != null ? idea.getArchivedAt().toString() : null;
            dto.createdAt = idea.getCreatedAt() != null ? idea.getCreatedAt().toString() : null;
            dto.updatedAt = idea.getUpdatedAt() != null ? idea.getUpdatedAt().toString() : null;
            return dto;
        }
    }

    // ── Category endpoints ────────────────────────────────────────────────────

    @GetMapping("/categories")
    public List<IdeaCategory> getAllCategories() {
        return ideaService.getAllCategories();
    }

    @PostMapping("/categories")
    public ResponseEntity<IdeaCategory> createCategory(@RequestBody CategoryPayload payload) {
        if (payload.getName() == null || payload.getName().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ideaService.createCategory(payload.getName().trim())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(409).build());
    }

    @PutMapping("/categories/{id}")
    public ResponseEntity<IdeaCategory> updateCategory(@PathVariable Long id, @RequestBody CategoryPayload payload) {
        return ideaService.updateCategory(id, payload.getName())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/categories/{id}")
    public ResponseEntity<Void> deleteCategory(@PathVariable Long id) {
        return switch (ideaService.deleteCategory(id)) {
            case NOT_FOUND -> ResponseEntity.notFound().build();
            case HAS_IDEAS -> ResponseEntity.status(409).build();
            case DELETED -> ResponseEntity.ok().build();
        };
    }

    @PatchMapping("/categories/{id}/archive")
    public ResponseEntity<IdeaCategory> archiveCategory(@PathVariable Long id) {
        return ideaService.archiveCategory(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PatchMapping("/categories/{id}/unarchive")
    public ResponseEntity<IdeaCategory> unarchiveCategory(@PathVariable Long id) {
        return ideaService.unarchiveCategory(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // ── Idea endpoints ────────────────────────────────────────────────────────

    @GetMapping
    public List<IdeaDto> getAllIdeas(@RequestParam(required = false) Long categoryId) {
        return ideaService.getAll(categoryId).stream().map(IdeaDto::from).collect(Collectors.toList());
    }

    @GetMapping("/search")
    public List<IdeaDto> search(@RequestParam String keyword) {
        String kw = keyword.trim().toLowerCase();
        if (kw.isEmpty()) return List.of();
        return ideaService.search("%" + kw + "%").stream().map(IdeaDto::from).collect(Collectors.toList());
    }

    @PostMapping
    public ResponseEntity<IdeaDto> createIdea(@RequestBody IdeaPayload payload) {
        if (payload.getTitle() == null || payload.getTitle().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        Idea saved = ideaService.create(payload.getTitle(), payload.getContent(),
                payload.getSubCategory(), payload.getRating(), payload.getCategoryId());
        return ResponseEntity.ok(IdeaDto.from(saved));
    }

    @PutMapping("/{id}")
    public ResponseEntity<IdeaDto> updateIdea(@PathVariable Long id, @RequestBody IdeaPayload payload) {
        return ideaService.update(id, payload.getTitle(), payload.getContent(),
                        payload.getSubCategory(), payload.getRating(), payload.getCategoryId())
                .map(idea -> ResponseEntity.ok(IdeaDto.from(idea)))
                .orElseGet(() -> ResponseEntity.notFound().build());
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
        return ideaService.updateRating(id, body.getRating())
                .map(idea -> ResponseEntity.ok(IdeaDto.from(idea)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteIdea(@PathVariable Long id) {
        return ideaService.delete(id)
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
    }

    // ── Archive ─────────────────────────────────────────────────

    @GetMapping("/archived")
    public List<IdeaDto> getArchivedIdeas() {
        return ideaService.getArchived().stream().map(IdeaDto::from).collect(Collectors.toList());
    }

    @PatchMapping("/{id}/archive")
    public ResponseEntity<IdeaDto> archiveIdea(@PathVariable Long id) {
        return ideaService.setArchived(id, true)
                .map(idea -> ResponseEntity.ok(IdeaDto.from(idea)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PatchMapping("/{id}/unarchive")
    public ResponseEntity<IdeaDto> unarchiveIdea(@PathVariable Long id) {
        return ideaService.setArchived(id, false)
                .map(idea -> ResponseEntity.ok(IdeaDto.from(idea)))
                .orElseGet(() -> ResponseEntity.notFound().build());
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
        return ideaService.listAttachments(ideaId)
                .map(list -> ResponseEntity.ok(list.stream().map(AttachmentDto::from).collect(Collectors.toList())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping(value = "/{ideaId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<AttachmentDto> uploadAttachment(
            @PathVariable Long ideaId,
            @RequestParam("file") MultipartFile file) throws IOException {
        if (!ideaService.ideaExists(ideaId)) {
            return ResponseEntity.notFound().build();
        }
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        String fileName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "unnamed";
        String contentType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
        IdeaAttachment saved = ideaService.saveAttachment(ideaId, fileName, contentType, file.getSize(), file.getBytes());
        return ResponseEntity.ok(AttachmentDto.from(saved));
    }

    @GetMapping("/{ideaId}/attachments/{attachmentId}/download")
    public ResponseEntity<byte[]> downloadAttachment(
            @PathVariable Long ideaId,
            @PathVariable Long attachmentId) {
        return ideaService.getAttachment(ideaId, attachmentId)
                .map(a -> {
                    String fileName = a.getFileName() == null || a.getFileName().isBlank() ? "attachment" : a.getFileName();
                    ContentDisposition disposition = ContentDisposition.attachment()
                            .filename(fileName, StandardCharsets.UTF_8)
                            .build();
                    return ResponseEntity.ok()
                            .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                            .contentType(MediaType.parseMediaType(a.getContentType()))
                            .contentLength(a.getFileSize())
                            .body(a.getData());
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{ideaId}/attachments/{attachmentId}")
    public ResponseEntity<Void> deleteAttachment(
            @PathVariable Long ideaId,
            @PathVariable Long attachmentId) {
        return ideaService.deleteAttachment(ideaId, attachmentId)
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
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
        return ideaService.listComments(ideaId)
                .map(list -> ResponseEntity.ok(list.stream().map(CommentDto::from).collect(Collectors.toList())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{ideaId}/comments")
    public ResponseEntity<CommentDto> createComment(
            @PathVariable Long ideaId,
            @RequestBody CommentPayload payload) {
        if (!ideaService.ideaExists(ideaId)) {
            return ResponseEntity.notFound().build();
        }
        if (payload.getContent() == null || payload.getContent().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(CommentDto.from(ideaService.createComment(ideaId, payload.getContent())));
    }

    @PutMapping("/{ideaId}/comments/{commentId}")
    public ResponseEntity<CommentDto> updateComment(
            @PathVariable Long ideaId,
            @PathVariable Long commentId,
            @RequestBody CommentPayload payload) {
        return ideaService.updateComment(ideaId, commentId, payload.getContent())
                .map(c -> ResponseEntity.ok(CommentDto.from(c)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{ideaId}/comments/{commentId}")
    public ResponseEntity<Void> deleteComment(
            @PathVariable Long ideaId,
            @PathVariable Long commentId) {
        return ideaService.deleteComment(ideaId, commentId)
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
    }

}
