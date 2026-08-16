package com.stockcard.service;

import com.stockcard.entity.Category;
import com.stockcard.entity.EarningsReport;
import com.stockcard.entity.Stock;
import com.stockcard.entity.StockDocument;
import com.stockcard.entity.StockTimeline;
import com.stockcard.repository.CategoryRepository;
import com.stockcard.repository.EarningsReportRepository;
import com.stockcard.repository.IndustryChainRepository;
import com.stockcard.repository.StockDocumentRepository;
import com.stockcard.repository.StockRepository;
import com.stockcard.repository.StockTimelineRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/** Business logic for stocks: persistence, timeline auditing, and search orchestration. */
@Service
@RequiredArgsConstructor
public class StockService {

    private final StockRepository stockRepository;
    private final CategoryRepository categoryRepository;
    private final StockTimelineRepository stockTimelineRepository;
    private final StockDocumentRepository stockDocumentRepository;
    private final IndustryChainRepository industryChainRepository;
    private final EarningsReportRepository earningsReportRepository;

    public List<Stock> findAll() {
        return stockRepository.findAll();
    }

    @Transactional
    public Stock create(Stock stock) {
        Stock saved = stockRepository.save(stock);
        recordTimeline(saved, "CREATE", "新增股票记录");
        return saved;
    }

    @Transactional
    public Optional<Stock> update(Long id, Stock details) {
        return stockRepository.findById(id).map(stock -> {
            List<String> changedFields = collectChangedFields(stock, details);

            stock.setName(details.getName());
            stock.setCode(details.getCode());
            stock.setNotes(details.getNotes());
            stock.setRecommender(details.getRecommender());
            stock.setBusiness(details.getBusiness());
            stock.setCustomers(details.getCustomers());
            stock.setCompetitors(details.getCompetitors());
            stock.setStrengths(details.getStrengths());
            stock.setStructuralWeaknesses(details.getStructuralWeaknesses());
            stock.setFuture(details.getFuture());
            stock.setFounderCeoHolding(details.getFounderCeoHolding());
            stock.setIndustryPosition(details.getIndustryPosition());
            if (details.getMarket() != null) {
                stock.setMarket(details.getMarket());
            }
            if (details.getResearchValue() != null) {
                stock.setResearchValue(details.getResearchValue());
            }

            Stock saved = stockRepository.save(stock);
            String description = changedFields.isEmpty()
                    ? "更新公司信息（字段未变化）"
                    : "更新公司信息：" + String.join("、", changedFields);
            recordTimeline(saved, "UPDATE", description);
            return saved;
        });
    }

    @Transactional
    public boolean delete(Long id) {
        return stockRepository.findById(id).map(stock -> {
            recordTimeline(stock, "DELETE", "删除股票记录");
            stockDocumentRepository.deleteByStockId(stock.getId());
            industryChainRepository.deleteByStockId(stock.getId());
            earningsReportRepository.deleteByStockId(stock.getId());
            stockRepository.delete(stock);
            return true;
        }).orElse(false);
    }

    // ── Documents ─────────────────────────────────────────────────────────────

    public Optional<List<StockDocument>> listDocuments(Long stockId) {
        if (!stockRepository.existsById(stockId)) {
            return Optional.empty();
        }
        return Optional.of(stockDocumentRepository.findByStockIdOrderByCreatedAtDesc(stockId));
    }

    @Transactional
    public Optional<StockDocument> createDocument(Long stockId, StockDocument payload) {
        return stockRepository.findById(stockId).map(stock -> {
            StockDocument document = new StockDocument();
            document.setStockId(stock.getId());
            document.setStockCode(stock.getCode());
            document.setStockName(stock.getName());
            document.setTitle(payload.getTitle().trim());
            document.setContent(payload.getContent().trim());
            document.setCategory(payload.getCategory() != null ? payload.getCategory().trim() : null);

            StockDocument saved = stockDocumentRepository.save(document);
            recordTimeline(stock, "DOCUMENT", "新增文档：《" + saved.getTitle() + "》");
            return saved;
        });
    }

    @Transactional
    public Optional<StockDocument> updateDocument(Long stockId, Long docId, StockDocument payload) {
        return stockDocumentRepository.findById(docId)
                .filter(doc -> doc.getStockId().equals(stockId))
                .map(doc -> {
                    doc.setTitle(payload.getTitle().trim());
                    doc.setContent(payload.getContent().trim());
                    doc.setCategory(payload.getCategory() != null ? payload.getCategory().trim() : null);
                    StockDocument saved = stockDocumentRepository.save(doc);
                    stockRepository.findById(stockId).ifPresent(stock ->
                            recordTimeline(stock, "DOCUMENT", "编辑文档：《" + saved.getTitle() + "》"));
                    return saved;
                });
    }

    @Transactional
    public boolean deleteDocument(Long stockId, Long docId) {
        return stockDocumentRepository.findById(docId)
                .filter(doc -> doc.getStockId().equals(stockId))
                .map(doc -> {
                    stockDocumentRepository.delete(doc);
                    stockRepository.findById(stockId).ifPresent(stock ->
                            recordTimeline(stock, "DOCUMENT", "删除文档：《" + doc.getTitle() + "》"));
                    return true;
                }).orElse(false);
    }

    // ── Earnings Reports ──────────────────────────────────────────────────────

    public Optional<List<EarningsReport>> listEarnings(Long stockId) {
        if (!stockRepository.existsById(stockId)) {
            return Optional.empty();
        }
        return Optional.of(earningsReportRepository.findByStockIdOrderByReportDateDescCreatedAtDesc(stockId));
    }

    @Transactional
    public Optional<EarningsReport> createEarnings(Long stockId, EarningsReport payload) {
        return stockRepository.findById(stockId).map(stock -> {
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
            return saved;
        });
    }

    @Transactional
    public Optional<EarningsReport> updateEarnings(Long stockId, Long reportId, EarningsReport payload) {
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
                    return saved;
                });
    }

    @Transactional
    public boolean deleteEarnings(Long stockId, Long reportId) {
        return earningsReportRepository.findById(reportId)
                .filter(r -> r.getStockId().equals(stockId))
                .map(r -> {
                    earningsReportRepository.delete(r);
                    stockRepository.findById(stockId).ifPresent(stock ->
                            recordTimeline(stock, "EARNINGS", "删除财报记录：" + r.getTitle()));
                    return true;
                }).orElse(false);
    }

    // ── Misc updates ──────────────────────────────────────────────────────────

    @Transactional
    public Optional<Stock> updateResearchValue(Long id, int value) {
        return stockRepository.findById(id).map(stock -> {
            stock.setResearchValue(value);
            Stock saved = stockRepository.save(stock);
            recordTimeline(saved, "UPDATE", "更新研究价值评级：" + value + " 星");
            return saved;
        });
    }

    @Transactional
    public Optional<Stock> setCategories(Long id, Set<Long> categoryIds) {
        return stockRepository.findById(id).map(stock -> {
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
            return saved;
        });
    }

    public Optional<List<StockTimeline>> getTimeline(Long id) {
        if (!stockRepository.existsById(id)) {
            return Optional.empty();
        }
        return Optional.of(stockTimelineRepository.findByStockIdOrderByCreatedAtDesc(id));
    }

    public List<Stock> filter(Set<Long> categoryIds, String mode) {
        if (categoryIds.isEmpty()) {
            return stockRepository.findAll();
        }
        if ("intersection".equals(mode)) {
            return stockRepository.findByAllCategoryIds(categoryIds, categoryIds.size());
        }
        return stockRepository.findByAnyCategoryIds(categoryIds);
    }

    public List<Stock> search(String keyword) {
        String kw = keyword.trim().toLowerCase();
        if (kw.isEmpty()) {
            return stockRepository.findAll();
        }
        String pattern = "%" + kw + "%";
        Set<Long> ids = new HashSet<>();
        ids.addAll(stockDocumentRepository.findStockIdsByTitleOrContentContaining(pattern));
        ids.addAll(stockTimelineRepository.findStockIdsByDescriptionContaining(pattern));
        ids.addAll(earningsReportRepository.findStockIdsByTitleContaining(pattern));
        if (ids.isEmpty()) {
            ids = Set.of(-1L); // 避免空集合导致的 IN () 问题
        }
        return stockRepository.searchByFieldsOrIds(pattern, ids);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

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
}
