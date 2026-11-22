package com.stockcard.repository;

import com.stockcard.entity.FedTextEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface FedTextEventRepository extends JpaRepository<FedTextEvent, Long> {

    /** The columns of a list row; the body is deliberately left out. */
    interface Summary {
        Long getId();
        LocalDate getDocDate();
        String getTitle();
        String getUrl();
        String getDocType();
        String getCategories();
        double getStance();
        String getDirectiveChanges();
    }

    List<Summary> findAllByOrderByDocDateDescIdDesc(Pageable pageable);

    List<Summary> findByDocDateBetweenOrderByDocDateDescIdDesc(LocalDate from, LocalDate to);

    Optional<FedTextEvent> findFirstByDocTypeAndDocDateBeforeOrderByDocDateDescIdDesc(String docType, LocalDate before);

    @Query("select e.url from FedTextEvent e")
    List<String> findAllUrls();

    @Query("select max(e.docDate) from FedTextEvent e")
    LocalDate maxDocDate();
}
