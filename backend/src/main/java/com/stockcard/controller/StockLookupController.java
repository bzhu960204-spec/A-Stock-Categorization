package com.stockcard.controller;

import com.stockcard.service.StockLookupService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/lookup")
@RequiredArgsConstructor
public class StockLookupController {

    private final StockLookupService stockLookupService;

    // ─────────────── A股 (EastMoney) ───────────────

    @GetMapping
    public ResponseEntity<Map<String, String>> lookup(@RequestParam String keyword) {
        return ResponseEntity.ok(stockLookupService.lookup(keyword));
    }

    @GetMapping("/suggest")
    public ResponseEntity<List<Map<String, String>>> suggest(
            @RequestParam String keyword,
            @RequestParam(defaultValue = "8") int limit) {
        return ResponseEntity.ok(stockLookupService.suggest(keyword, limit));
    }

    // ─────────────── 美股 (SEC primary) ───────────────

    @GetMapping("/us")
    public ResponseEntity<Map<String, String>> lookupUs(@RequestParam String keyword) {
        return ResponseEntity.ok(stockLookupService.lookupUs(keyword));
    }

    @GetMapping("/us/suggest")
    public ResponseEntity<List<Map<String, String>>> suggestUs(
            @RequestParam String keyword,
            @RequestParam(defaultValue = "8") int limit) {
        return ResponseEntity.ok(stockLookupService.suggestUs(keyword, limit));
    }

    // ─────────────── 全球市场 (Twelve Data) ───────────────

    @GetMapping("/global/suggest")
    public ResponseEntity<List<Map<String, String>>> suggestGlobal(
            @RequestParam String keyword,
            @RequestParam String market,
            @RequestParam(defaultValue = "8") int limit) {
        return ResponseEntity.ok(stockLookupService.suggestGlobal(keyword, market, limit));
    }

    @GetMapping("/global")
    public ResponseEntity<Map<String, String>> lookupGlobal(
            @RequestParam String keyword,
            @RequestParam String market) {
        return ResponseEntity.ok(stockLookupService.lookupGlobal(keyword, market));
    }
}
