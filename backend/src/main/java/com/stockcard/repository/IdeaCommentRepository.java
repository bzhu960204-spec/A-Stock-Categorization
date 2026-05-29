package com.stockcard.repository;

import com.stockcard.entity.IdeaComment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface IdeaCommentRepository extends JpaRepository<IdeaComment, Long> {
    List<IdeaComment> findByIdeaIdOrderByCreatedAtAsc(Long ideaId);
    void deleteByIdeaId(Long ideaId);
}
