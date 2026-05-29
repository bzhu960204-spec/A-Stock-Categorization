package com.stockcard.repository;

import com.stockcard.entity.IdeaAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface IdeaAttachmentRepository extends JpaRepository<IdeaAttachment, Long> {
    List<IdeaAttachment> findByIdeaIdOrderByCreatedAtDesc(Long ideaId);
    void deleteByIdeaId(Long ideaId);
}
