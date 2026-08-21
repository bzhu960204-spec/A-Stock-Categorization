package com.stockcard.controller;

import com.stockcard.entity.EarningsReport;
import com.stockcard.entity.StockDocument;
import com.stockcard.entity.Stock;
import com.stockcard.entity.StockTimeline;
import com.stockcard.service.StockService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/stocks")
@RequiredArgsConstructor
public class StockController {

    private final StockService stockService;

    @GetMapping
    public List<Stock> getAllStocks() {
        return stockService.findAll();
    }

    @PostMapping
    public Stock createStock(@RequestBody Stock stock) {
        return stockService.create(stock);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Stock> updateStock(@PathVariable Long id, @RequestBody Stock stockDetails) {
        return stockService.update(id, stockDetails)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteStock(@PathVariable Long id) {
        return stockService.delete(id)
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
    }

    // ── Archive ───────────────────────────────────────────────────────────────

    @GetMapping("/archived")
    public List<Stock> getArchivedStocks() {
        return stockService.findArchived();
    }

    @PatchMapping("/{id}/archive")
    public ResponseEntity<Stock> archiveStock(@PathVariable Long id) {
        return stockService.setArchived(id, true)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PatchMapping("/{id}/unarchive")
    public ResponseEntity<Stock> unarchiveStock(@PathVariable Long id) {
        return stockService.setArchived(id, false)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/documents")
    public ResponseEntity<List<StockDocument>> getStockDocuments(@PathVariable Long id) {
        return stockService.listDocuments(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/documents")
    public ResponseEntity<StockDocument> createStockDocument(@PathVariable Long id, @RequestBody StockDocument payload) {
        if (payload == null || isBlank(payload.getTitle()) || isBlank(payload.getContent())) {
            return ResponseEntity.badRequest().build();
        }
        return stockService.createDocument(id, payload)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/{stockId}/documents/{docId}")
    public ResponseEntity<StockDocument> updateStockDocument(
            @PathVariable Long stockId,
            @PathVariable Long docId,
            @RequestBody StockDocument payload) {
        if (payload == null || isBlank(payload.getTitle()) || isBlank(payload.getContent())) {
            return ResponseEntity.badRequest().build();
        }
        return stockService.updateDocument(stockId, docId, payload)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{stockId}/documents/{docId}")
    public ResponseEntity<Void> deleteStockDocument(
            @PathVariable Long stockId,
            @PathVariable Long docId) {
        return stockService.deleteDocument(stockId, docId)
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
    }

    // ── Earnings Reports ──────────────────────────────────────────────────────

    @GetMapping("/{id}/earnings")
    public ResponseEntity<List<EarningsReport>> getEarningsReports(@PathVariable Long id) {
        return stockService.listEarnings(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/earnings")
    public ResponseEntity<EarningsReport> createEarningsReport(
            @PathVariable Long id, @RequestBody EarningsReport payload) {
        if (payload == null || isBlank(payload.getTitle())) return ResponseEntity.badRequest().build();
        return stockService.createEarnings(id, payload)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/{stockId}/earnings/{reportId}")
    public ResponseEntity<EarningsReport> updateEarningsReport(
            @PathVariable Long stockId,
            @PathVariable Long reportId,
            @RequestBody EarningsReport payload) {
        if (payload == null || isBlank(payload.getTitle())) return ResponseEntity.badRequest().build();
        return stockService.updateEarnings(stockId, reportId, payload)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{stockId}/earnings/{reportId}")
    public ResponseEntity<Void> deleteEarningsReport(
            @PathVariable Long stockId,
            @PathVariable Long reportId) {
        return stockService.deleteEarnings(stockId, reportId)
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
    }

    // 单独更新研究价值评级
    @PatchMapping("/{id}/research-value")
    public ResponseEntity<Stock> updateResearchValue(@PathVariable Long id, @RequestBody Map<String, Integer> body) {
        Integer value = body.get("researchValue");
        if (value == null || value < 0 || value > 5) {
            return ResponseEntity.badRequest().build();
        }
        return stockService.updateResearchValue(id, value)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // 给股票设置分类
    @PutMapping("/{id}/categories")
    public ResponseEntity<Stock> setCategories(@PathVariable Long id, @RequestBody Set<Long> categoryIds) {
        return stockService.setCategories(id, categoryIds)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<List<StockTimeline>> getStockTimeline(@PathVariable Long id) {
        return stockService.getTimeline(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // 筛选：按分类过滤 (mode: union/intersection)
    @GetMapping("/filter")
    public List<Stock> filterByCategories(
            @RequestParam Set<Long> categoryIds,
            @RequestParam(defaultValue = "union") String mode) {
        return stockService.filter(categoryIds, mode);
    }

    // 搜索股票（代码、名称及所有档案字段 + 文档内容 + 日志描述，数据库查询）
    @GetMapping("/search")
    public List<Stock> searchStocks(@RequestParam String keyword) {
        return stockService.search(keyword);
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
