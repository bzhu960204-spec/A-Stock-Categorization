package com.stockcard.controller;

import com.stockcard.service.EarningsCalendarService;
import com.stockcard.service.EarningsNoteService;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/earnings-calendar")
public class EarningsCalendarController {

    private static final Logger log = LoggerFactory.getLogger(EarningsCalendarController.class);
    /** A month is ~22 trading days at up to 15s each; leave generous headroom. */
    private static final Duration STREAM_TIMEOUT = Duration.ofMinutes(15);

    private final EarningsCalendarService service;
    private final EarningsNoteService noteService;
    /** Bounded pool private to this controller (a shared Executor bean would replace Spring Boot's default one). */
    private final ThreadPoolTaskExecutor executor;

    public EarningsCalendarController(EarningsCalendarService service, EarningsNoteService noteService) {
        this.service = service;
        this.noteService = noteService;
        this.executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("earnings-sse-");
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(4);
        executor.initialize();
    }

    @PreDestroy
    void shutdown() {
        executor.shutdown();
    }

    /** 获取所有已缓存的财报日历数据。 */
    @GetMapping("/calendar")
    public Map<String, Object> getCalendar() {
        return service.getCalendar();
    }

    /** SSE 流式拉取指定月份的财报数据。 */
    @GetMapping(value = "/refresh-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter refreshStream(@RequestParam int year, @RequestParam int month) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT.toMillis());
        if (year < 2020 || year > 2035 || month < 1 || month > 12) {
            emitter.completeWithError(new IllegalArgumentException("无效的年份或月份"));
            return emitter;
        }
        try {
            executor.execute(() -> {
                try {
                    service.streamMonth(year, month, event -> {
                        try {
                            emitter.send(SseEmitter.event().data(event));
                        } catch (IOException e) {
                            // Client went away; abort the remaining fetches.
                            throw new UncheckedIOException(e);
                        }
                    });
                    emitter.complete();
                } catch (UncheckedIOException e) {
                    log.debug("Earnings stream for {}-{} aborted: client disconnected", year, month);
                } catch (Exception e) {
                    log.warn("Earnings stream for {}-{} failed", year, month, e);
                    emitter.completeWithError(e);
                }
            });
        } catch (TaskRejectedException e) {
            emitter.completeWithError(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "刷新任务过多，请稍后再试"));
        }
        return emitter;
    }

    /** 获取单条财报笔记。 */
    @GetMapping("/notes")
    public Map<String, String> getNote(@RequestParam String ticker, @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return Map.of("content", noteService.getContent(ticker, date));
    }

    public record NotePayload(String ticker, String date, String content) {}

    /** 保存/删除财报笔记（内容为空则删除）。 */
    @PostMapping("/notes")
    public ResponseEntity<Map<String, Object>> saveNote(@RequestBody NotePayload body) {
        String ticker = body.ticker() == null ? "" : body.ticker();
        String dateStr = body.date() == null ? "" : body.date();
        String content = body.content() == null ? "" : body.content();
        if (ticker.isBlank() || dateStr.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "需要 ticker 和 date"));
        }
        if (content.length() > EarningsNoteService.MAX_CONTENT_LENGTH) {
            return ResponseEntity.badRequest().body(Map.of("message", "笔记内容过长（最多50000字符）"));
        }
        noteService.save(ticker, LocalDate.parse(dateStr), content);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
