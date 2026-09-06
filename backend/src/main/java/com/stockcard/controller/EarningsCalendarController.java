package com.stockcard.controller;

import com.stockcard.entity.EarningsNote;
import com.stockcard.repository.EarningsNoteRepository;
import com.stockcard.service.EarningsCalendarService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@RestController
@RequestMapping("/api/earnings-calendar")
@RequiredArgsConstructor
public class EarningsCalendarController {

    private final EarningsCalendarService service;
    private final EarningsNoteRepository noteRepo;

    private final ExecutorService executor = Executors.newCachedThreadPool();

    /** 获取所有已缓存的财报日历数据。 */
    @GetMapping("/calendar")
    public Map<String, Object> getCalendar() {
        return service.getCalendar();
    }

    /** SSE 流式拉取指定月份的财报数据。 */
    @GetMapping(value = "/refresh-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter refreshStream(@RequestParam int year, @RequestParam int month) {
        SseEmitter emitter = new SseEmitter(0L); // 无超时
        if (year < 2020 || year > 2035 || month < 1 || month > 12) {
            emitter.completeWithError(new IllegalArgumentException("无效的年份或月份"));
            return emitter;
        }
        executor.submit(() -> {
            try {
                service.streamMonth(year, month, event -> {
                    try {
                        emitter.send(SseEmitter.event().data(event));
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }
                });
                emitter.complete();
            } catch (Exception e) {
                emitter.completeWithError(e);
            }
        });
        return emitter;
    }

    /** 获取单条财报笔记。 */
    @GetMapping("/notes")
    public Map<String, String> getNote(@RequestParam String ticker, @RequestParam String date) {
        String content = noteRepo
                .findByTickerAndNoteDate(ticker.toUpperCase(), LocalDate.parse(date))
                .map(EarningsNote::getContent)
                .orElse("");
        return Map.of("content", content == null ? "" : content);
    }

    /** 保存/删除财报笔记（内容为空则删除）。 */
    @PostMapping("/notes")
    public ResponseEntity<Map<String, Object>> saveNote(@RequestBody Map<String, String> body) {
        String ticker = (body.getOrDefault("ticker", "")).toUpperCase();
        String dateStr = body.getOrDefault("date", "");
        String content = body.getOrDefault("content", "");
        if (ticker.isBlank() || dateStr.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "需要 ticker 和 date"));
        }
        if (content.length() > 50000) {
            return ResponseEntity.badRequest().body(Map.of("message", "笔记内容过长（最多50000字符）"));
        }
        LocalDate date = LocalDate.parse(dateStr);
        var existing = noteRepo.findByTickerAndNoteDate(ticker, date);
        if (content.isBlank()) {
            existing.ifPresent(noteRepo::delete);
        } else {
            EarningsNote note = existing.orElseGet(EarningsNote::new);
            note.setTicker(ticker);
            note.setNoteDate(date);
            note.setContent(content);
            note.setUpdatedAt(LocalDateTime.now());
            noteRepo.save(note);
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
