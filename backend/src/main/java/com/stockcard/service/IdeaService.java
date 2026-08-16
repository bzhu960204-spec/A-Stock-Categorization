package com.stockcard.service;

import com.stockcard.entity.Idea;
import com.stockcard.entity.IdeaAttachment;
import com.stockcard.entity.IdeaCategory;
import com.stockcard.entity.IdeaComment;
import com.stockcard.repository.IdeaAttachmentRepository;
import com.stockcard.repository.IdeaCategoryRepository;
import com.stockcard.repository.IdeaCommentRepository;
import com.stockcard.repository.IdeaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class IdeaService {

    private final IdeaCategoryRepository categoryRepository;
    private final IdeaRepository ideaRepository;
    private final IdeaAttachmentRepository attachmentRepository;
    private final IdeaCommentRepository commentRepository;

    public enum CategoryDeleteResult { NOT_FOUND, HAS_IDEAS, DELETED }

    // ── Categories ────────────────────────────────────────────────────────────

    public List<IdeaCategory> getAllCategories() {
        return categoryRepository.findAll();
    }

    /** empty = a category with this name already exists (conflict). */
    public Optional<IdeaCategory> createCategory(String name) {
        if (categoryRepository.existsByName(name)) {
            return Optional.empty();
        }
        IdeaCategory cat = new IdeaCategory();
        cat.setName(name);
        return Optional.of(categoryRepository.save(cat));
    }

    public Optional<IdeaCategory> updateCategory(Long id, String name) {
        return categoryRepository.findById(id).map(cat -> {
            if (name != null && !name.isBlank()) {
                cat.setName(name.trim());
            }
            return categoryRepository.save(cat);
        });
    }

    @Transactional
    public CategoryDeleteResult deleteCategory(Long id) {
        if (!categoryRepository.existsById(id)) {
            return CategoryDeleteResult.NOT_FOUND;
        }
        if (ideaRepository.countByCategoryId(id) > 0) {
            return CategoryDeleteResult.HAS_IDEAS;
        }
        categoryRepository.deleteById(id);
        return CategoryDeleteResult.DELETED;
    }

    // ── Ideas ─────────────────────────────────────────────────────────────────

    public boolean ideaExists(Long id) {
        return ideaRepository.existsById(id);
    }

    public List<Idea> getAll(Long categoryId) {
        if (categoryId != null) {
            return ideaRepository.findByCategoryIdOrderByCreatedAtDesc(categoryId);
        }
        return ideaRepository.findAllByOrderByCreatedAtDesc();
    }

    public List<Idea> search(String pattern) {
        return ideaRepository.searchByKeyword(pattern);
    }

    public Idea create(String title, String content, String subCategory, Integer rating, Long categoryId) {
        Idea idea = new Idea();
        idea.setTitle(title.trim());
        idea.setContent(content);
        idea.setSubCategory(subCategory);
        if (rating != null) idea.setRating(Math.max(0, Math.min(5, rating)));
        if (categoryId != null) {
            categoryRepository.findById(categoryId).ifPresent(idea::setCategory);
        }
        return ideaRepository.save(idea);
    }

    public Optional<Idea> update(Long id, String title, String content, String subCategory, Integer rating, Long categoryId) {
        return ideaRepository.findById(id).map(idea -> {
            if (title != null && !title.isBlank()) {
                idea.setTitle(title.trim());
            }
            idea.setContent(content);
            idea.setSubCategory(subCategory);
            if (rating != null) idea.setRating(Math.max(0, Math.min(5, rating)));
            if (categoryId != null) {
                categoryRepository.findById(categoryId).ifPresent(idea::setCategory);
            } else {
                idea.setCategory(null);
            }
            return ideaRepository.save(idea);
        });
    }

    public Optional<Idea> updateRating(Long id, int rating) {
        return ideaRepository.findById(id).map(idea -> {
            idea.setRating(rating);
            return ideaRepository.save(idea);
        });
    }

    @Transactional
    public boolean delete(Long id) {
        return ideaRepository.findById(id).map(idea -> {
            commentRepository.deleteByIdeaId(id);
            attachmentRepository.deleteByIdeaId(id);
            ideaRepository.delete(idea);
            return true;
        }).orElse(false);
    }

    // ── Attachments ───────────────────────────────────────────────────────────

    public Optional<List<IdeaAttachment>> listAttachments(Long ideaId) {
        if (!ideaRepository.existsById(ideaId)) {
            return Optional.empty();
        }
        return Optional.of(attachmentRepository.findByIdeaIdOrderByCreatedAtDesc(ideaId));
    }

    public IdeaAttachment saveAttachment(Long ideaId, String fileName, String contentType, long size, byte[] data) {
        IdeaAttachment attachment = new IdeaAttachment();
        attachment.setIdeaId(ideaId);
        attachment.setFileName(fileName);
        attachment.setContentType(contentType);
        attachment.setFileSize(size);
        attachment.setData(data);
        return attachmentRepository.save(attachment);
    }

    public Optional<IdeaAttachment> getAttachment(Long ideaId, Long attachmentId) {
        return attachmentRepository.findById(attachmentId)
                .filter(a -> a.getIdeaId().equals(ideaId));
    }

    @Transactional
    public boolean deleteAttachment(Long ideaId, Long attachmentId) {
        return attachmentRepository.findById(attachmentId)
                .filter(a -> a.getIdeaId().equals(ideaId))
                .map(a -> {
                    attachmentRepository.delete(a);
                    return true;
                }).orElse(false);
    }

    // ── Comments ──────────────────────────────────────────────────────────────

    public Optional<List<IdeaComment>> listComments(Long ideaId) {
        if (!ideaRepository.existsById(ideaId)) {
            return Optional.empty();
        }
        return Optional.of(commentRepository.findByIdeaIdOrderByCreatedAtAsc(ideaId));
    }

    public IdeaComment createComment(Long ideaId, String content) {
        IdeaComment comment = new IdeaComment();
        comment.setIdeaId(ideaId);
        comment.setContent(content);
        return commentRepository.save(comment);
    }

    public Optional<IdeaComment> updateComment(Long ideaId, Long commentId, String content) {
        return commentRepository.findById(commentId)
                .filter(c -> c.getIdeaId().equals(ideaId))
                .map(c -> {
                    if (content != null && !content.isBlank()) {
                        c.setContent(content);
                    }
                    return commentRepository.save(c);
                });
    }

    @Transactional
    public boolean deleteComment(Long ideaId, Long commentId) {
        return commentRepository.findById(commentId)
                .filter(c -> c.getIdeaId().equals(ideaId))
                .map(c -> {
                    commentRepository.delete(c);
                    return true;
                }).orElse(false);
    }
}
