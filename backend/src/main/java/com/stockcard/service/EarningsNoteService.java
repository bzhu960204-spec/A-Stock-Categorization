package com.stockcard.service;

import com.stockcard.entity.EarningsNote;
import com.stockcard.repository.EarningsNoteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Locale;

/** Markdown notes attached to a company's earnings date (one per ticker + date). */
@Service
public class EarningsNoteService {

    public static final int MAX_CONTENT_LENGTH = 50_000;

    private final EarningsNoteRepository noteRepo;

    public EarningsNoteService(EarningsNoteRepository noteRepo) {
        this.noteRepo = noteRepo;
    }

    public String getContent(String ticker, LocalDate date) {
        return noteRepo.findByTickerAndNoteDate(normalize(ticker), date)
                .map(EarningsNote::getContent)
                .orElse("");
    }

    /** Saves the note, or deletes it when the content is blank. */
    @Transactional
    public void save(String ticker, LocalDate date, String content) {
        String t = normalize(ticker);
        var existing = noteRepo.findByTickerAndNoteDate(t, date);
        if (content == null || content.isBlank()) {
            existing.ifPresent(noteRepo::delete);
            return;
        }
        EarningsNote note = existing.orElseGet(EarningsNote::new);
        note.setTicker(t);
        note.setNoteDate(date);
        note.setContent(content);
        noteRepo.save(note);
    }

    private static String normalize(String ticker) {
        return ticker == null ? "" : ticker.trim().toUpperCase(Locale.ROOT);
    }
}
