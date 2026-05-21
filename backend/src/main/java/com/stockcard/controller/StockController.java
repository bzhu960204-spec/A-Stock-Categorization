package com.stockcard.controller;

import com.stockcard.entity.Category;
import com.stockcard.entity.EarningsReport;
import com.stockcard.entity.StockDocument;
import com.stockcard.entity.Stock;
import com.stockcard.entity.StockTimeline;
import com.stockcard.repository.CategoryRepository;
import com.stockcard.repository.EarningsReportRepository;
import com.stockcard.repository.IndustryChainRepository;
import com.stockcard.repository.StockDocumentRepository;
import com.stockcard.repository.StockRepository;
import com.stockcard.repository.StockTimelineRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/stocks")
@RequiredArgsConstructor
public class StockController {

    private final StockRepository stockRepository;
    private final CategoryRepository categoryRepository;
    private final StockTimelineRepository stockTimelineRepository;
    private final StockDocumentRepository stockDocumentRepository;
    private final IndustryChainRepository industryChainRepository;
    private final EarningsReportRepository earningsReportRepository;

    @GetMapping
    public List<Stock> getAllStocks() {
        return stockRepository.findAll();
    }

    @PostMapping
    public Stock createStock(@RequestBody Stock stock) {
        Stock saved = stockRepository.save(stock);
        recordTimeline(saved, "CREATE", "新增股票记录");
        return saved;
    }

    @PutMapping("/{id}")
    public ResponseEntity<Stock> updateStock(@PathVariable Long id, @RequestBody Stock stockDetails) {
        return stockRepository.findById(id)
                .map(stock -> {
                    List<String> changedFields = collectChangedFields(stock, stockDetails);

                    stock.setName(stockDetails.getName());
                    stock.setCode(stockDetails.getCode());
                    stock.setNotes(stockDetails.getNotes());
                    stock.setRecommender(stockDetails.getRecommender());
                    stock.setBusiness(stockDetails.getBusiness());
                    stock.setCustomers(stockDetails.getCustomers());
                    stock.setCompetitors(stockDetails.getCompetitors());
                    stock.setStrengths(stockDetails.getStrengths());
                    stock.setStructuralWeaknesses(stockDetails.getStructuralWeaknesses());
                    stock.setFuture(stockDetails.getFuture());
                    stock.setFounderCeoHolding(stockDetails.getFounderCeoHolding());
                    stock.setIndustryPosition(stockDetails.getIndustryPosition());
                    if (stockDetails.getMarket() != null) {
                        stock.setMarket(stockDetails.getMarket());
                    }
                    if (stockDetails.getResearchValue() != null) {
                        stock.setResearchValue(stockDetails.getResearchValue());
                    }

                    Stock saved = stockRepository.save(stock);
                    String description = changedFields.isEmpty()
                            ? "更新公司信息（字段未变化）"
                            : "更新公司信息：" + String.join("、", changedFields);
                    recordTimeline(saved, "UPDATE", description);

                    return ResponseEntity.ok(saved);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteStock(@PathVariable Long id) {
        return stockRepository.findById(id)
                .map(stock -> {
                    recordTimeline(stock, "DELETE", "删除股票记录");
                    stockDocumentRepository.deleteByStockId(stock.getId());
                    industryChainRepository.deleteByStockId(stock.getId());
                    earningsReportRepository.deleteByStockId(stock.getId());
                    stockRepository.delete(stock);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/documents")
    public ResponseEntity<List<StockDocument>> getStockDocuments(@PathVariable Long id) {
        if (!stockRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(stockDocumentRepository.findByStockIdOrderByCreatedAtDesc(id));
    }

    @PostMapping("/{id}/documents")
    public ResponseEntity<StockDocument> createStockDocument(@PathVariable Long id, @RequestBody StockDocument payload) {
        if (payload == null || isBlank(payload.getTitle()) || isBlank(payload.getContent())) {
            return ResponseEntity.badRequest().build();
        }

        return stockRepository.findById(id)
                .map(stock -> {
                    StockDocument document = new StockDocument();
                    document.setStockId(stock.getId());
                    document.setStockCode(stock.getCode());
                    document.setStockName(stock.getName());
                    document.setTitle(payload.getTitle().trim());
                    document.setContent(payload.getContent().trim());
                    document.setCategory(payload.getCategory() != null ? payload.getCategory().trim() : null);

                    StockDocument saved = stockDocumentRepository.save(document);
                    recordTimeline(stock, "DOCUMENT", "新增文档：《" + saved.getTitle() + "》");
                    return ResponseEntity.ok(saved);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{stockId}/documents/{docId}")
    public ResponseEntity<StockDocument> updateStockDocument(
            @PathVariable Long stockId,
            @PathVariable Long docId,
            @RequestBody StockDocument payload) {

        if (payload == null || isBlank(payload.getTitle()) || isBlank(payload.getContent())) {
            return ResponseEntity.badRequest().build();
        }

        return stockDocumentRepository.findById(docId)
                .filter(doc -> doc.getStockId().equals(stockId))
                .map(doc -> {
                    doc.setTitle(payload.getTitle().trim());
                    doc.setContent(payload.getContent().trim());
                    doc.setCategory(payload.getCategory() != null ? payload.getCategory().trim() : null);
                    StockDocument saved = stockDocumentRepository.save(doc);
                    stockRepository.findById(stockId).ifPresent(stock ->
                            recordTimeline(stock, "DOCUMENT", "编辑文档：《" + saved.getTitle() + "》"));
                    return ResponseEntity.ok(saved);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{stockId}/documents/{docId}")
    public ResponseEntity<Void> deleteStockDocument(
            @PathVariable Long stockId,
            @PathVariable Long docId) {

        return stockDocumentRepository.findById(docId)
                .filter(doc -> doc.getStockId().equals(stockId))
                .map(doc -> {
                    stockDocumentRepository.delete(doc);
                    stockRepository.findById(stockId).ifPresent(stock ->
                            recordTimeline(stock, "DOCUMENT", "删除文档：《" + doc.getTitle() + "》"));
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // ── Earnings Reports ──────────────────────────────────────────────────────

    @GetMapping("/{id}/earnings")
    public ResponseEntity<List<EarningsReport>> getEarningsReports(@PathVariable Long id) {
        if (!stockRepository.existsById(id)) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(earningsReportRepository.findByStockIdOrderByReportDateDescCreatedAtDesc(id));
    }

    @PostMapping("/{id}/earnings")
    public ResponseEntity<EarningsReport> createEarningsReport(
            @PathVariable Long id, @RequestBody EarningsReport payload) {
        if (payload == null || isBlank(payload.getTitle())) return ResponseEntity.badRequest().build();
        return stockRepository.findById(id)
                .map(stock -> {
                    EarningsReport report = new EarningsReport();
                    report.setStockId(stock.getId());
                    report.setStockCode(stock.getCode());
                    report.setStockName(stock.getName());
                    report.setTitle(payload.getTitle().trim());
                    report.setFiscalPeriod(payload.getFiscalPeriod());
                    report.setResult(payload.getResult());
                    report.setReportDate(payload.getReportDate());
                    report.setContent(payload.getContent() != null ? payload.getContent().trim() : "");
                    EarningsReport saved = earningsReportRepository.save(report);
                    recordTimeline(stock, "EARNINGS", "新增财报记录：" + saved.getTitle());
                    return ResponseEntity.ok(saved);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{stockId}/earnings/{reportId}")
    public ResponseEntity<EarningsReport> updateEarningsReport(
            @PathVariable Long stockId,
            @PathVariable Long reportId,
            @RequestBody EarningsReport payload) {
        if (payload == null || isBlank(payload.getTitle())) return ResponseEntity.badRequest().build();
        return earningsReportRepository.findById(reportId)
                .filter(r -> r.getStockId().equals(stockId))
                .map(r -> {
                    r.setTitle(payload.getTitle().trim());
                    r.setFiscalPeriod(payload.getFiscalPeriod());
                    r.setResult(payload.getResult());
                    r.setReportDate(payload.getReportDate());
                    r.setContent(payload.getContent() != null ? payload.getContent().trim() : "");
                    EarningsReport saved = earningsReportRepository.save(r);
                    stockRepository.findById(stockId).ifPresent(stock ->
                            recordTimeline(stock, "EARNINGS", "编辑财报记录：" + saved.getTitle()));
                    return ResponseEntity.ok(saved);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{stockId}/earnings/{reportId}")
    public ResponseEntity<Void> deleteEarningsReport(
            @PathVariable Long stockId,
            @PathVariable Long reportId) {
        return earningsReportRepository.findById(reportId)
                .filter(r -> r.getStockId().equals(stockId))
                .map(r -> {
                    earningsReportRepository.delete(r);
                    stockRepository.findById(stockId).ifPresent(stock ->
                            recordTimeline(stock, "EARNINGS", "删除财报记录：" + r.getTitle()));
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // 单独更新研究价值评级
    @PatchMapping("/{id}/research-value")
    public ResponseEntity<Stock> updateResearchValue(@PathVariable Long id, @RequestBody java.util.Map<String, Integer> body) {
        Integer value = body.get("researchValue");
        if (value == null || value < 0 || value > 5) {
            return ResponseEntity.badRequest().build();
        }
        return stockRepository.findById(id)
                .map(stock -> {
                    stock.setResearchValue(value);
                    Stock saved = stockRepository.save(stock);
                    recordTimeline(saved, "UPDATE", "更新研究价值评级：" + value + " 星");
                    return ResponseEntity.ok(saved);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // 给股票设置分类
    @PutMapping("/{id}/categories")
    public ResponseEntity<Stock> setCategories(@PathVariable Long id, @RequestBody Set<Long> categoryIds) {
        return stockRepository.findById(id)
                .map(stock -> {
                    Set<Category> categories = new HashSet<>(categoryRepository.findAllById(categoryIds));
                    stock.setCategories(categories);

                    Stock saved = stockRepository.save(stock);
                    String categoryText = categories.isEmpty()
                            ? "清空分类"
                            : "更新分类为：" + categories.stream()
                                    .map(Category::getName)
                                    .sorted()
                                    .collect(Collectors.joining("、"));
                    recordTimeline(saved, "CATEGORY", categoryText);

                    return ResponseEntity.ok(saved);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<List<StockTimeline>> getStockTimeline(@PathVariable Long id) {
        if (!stockRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(stockTimelineRepository.findByStockIdOrderByCreatedAtDesc(id));
    }

    // 筛选：按分类过滤 (mode: union/intersection)
    @GetMapping("/filter")
    public List<Stock> filterByCategories(
            @RequestParam Set<Long> categoryIds,
            @RequestParam(defaultValue = "union") String mode) {
        if (categoryIds.isEmpty()) {
            return stockRepository.findAll();
        }
        if ("intersection".equals(mode)) {
            return stockRepository.findByAllCategoryIds(categoryIds, categoryIds.size());
        }
        return stockRepository.findByAnyCategoryIds(categoryIds);
    }

    // 搜索股票（代码、名称及所有档案字段 + 文档内容 + 日志描述，内存过滤）
    @GetMapping("/search")
    public List<Stock> searchStocks(@RequestParam String keyword) {
        String kw = keyword.trim().toLowerCase();
        if (kw.isEmpty()) return stockRepository.findAll();
        String pattern = "%" + kw + "%";
        java.util.Set<Long> docMatches = stockDocumentRepository.findStockIdsByTitleOrContentContaining(pattern);
        java.util.Set<Long> timelineMatches = stockTimelineRepository.findStockIdsByDescriptionContaining(pattern);
        java.util.Set<Long> earningsMatches = earningsReportRepository.findStockIdsByTitleContaining(pattern);
        return stockRepository.findAll().stream()
            .filter(s -> contains(s.getCode(), kw)
                      || contains(s.getName(), kw)
                      || contains(s.getNotes(), kw)
                      || contains(s.getRecommender(), kw)
                      || contains(s.getBusiness(), kw)
                      || contains(s.getCustomers(), kw)
                      || contains(s.getCompetitors(), kw)
                      || contains(s.getStrengths(), kw)
                      || contains(s.getStructuralWeaknesses(), kw)
                      || contains(s.getFuture(), kw)
                      || contains(s.getFounderCeoHolding(), kw)
                      || docMatches.contains(s.getId())
                      || timelineMatches.contains(s.getId())
                      || earningsMatches.contains(s.getId()))
            .collect(java.util.stream.Collectors.toList());
    }

    private static boolean contains(String field, String kw) {
        return field != null && field.toLowerCase().contains(kw);
    }

    private void recordTimeline(Stock stock, String actionType, String description) {
        if (stock == null || stock.getId() == null) {
            return;
        }
        StockTimeline timeline = new StockTimeline();
        timeline.setStockId(stock.getId());
        timeline.setStockCode(stock.getCode());
        timeline.setStockName(stock.getName());
        timeline.setActionType(actionType);
        timeline.setDescription(description);
        stockTimelineRepository.save(timeline);
    }

    private List<String> collectChangedFields(Stock current, Stock next) {
        List<String> changedFields = new ArrayList<>();
        if (isChanged(current.getCode(), next.getCode())) changedFields.add("代码");
        if (isChanged(current.getName(), next.getName())) changedFields.add("名称");
        if (isChanged(current.getNotes(), next.getNotes())) changedFields.add("补充备注");
        if (isChanged(current.getRecommender(), next.getRecommender())) changedFields.add("推荐人");
        if (isChanged(current.getBusiness(), next.getBusiness())) changedFields.add("业务");
        if (isChanged(current.getCustomers(), next.getCustomers())) changedFields.add("客户");
        if (isChanged(current.getCompetitors(), next.getCompetitors())) changedFields.add("竞争对手");
        if (isChanged(current.getIndustryPosition(), next.getIndustryPosition())) changedFields.add("行业地位");
        if (isChanged(current.getStrengths(), next.getStrengths())) changedFields.add("竞争优势");
        if (isChanged(current.getStructuralWeaknesses(), next.getStructuralWeaknesses())) changedFields.add("结构性弱点");
        if (isChanged(current.getFuture(), next.getFuture())) changedFields.add("面向未来");
        if (isChanged(current.getFounderCeoHolding(), next.getFounderCeoHolding())) changedFields.add("创始人CEO及持股");
        if (!Objects.equals(current.getResearchValue(), next.getResearchValue())) changedFields.add("研究价值评级");
        return changedFields;
    }

    private boolean isChanged(String oldValue, String newValue) {
        return !Objects.equals(normalize(oldValue), normalize(newValue));
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
