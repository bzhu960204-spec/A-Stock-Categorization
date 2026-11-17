package com.stockcard.service;

import com.stockcard.entity.Category;
import com.stockcard.entity.EarningsReport;
import com.stockcard.entity.Stock;
import com.stockcard.entity.StockDocument;
import com.stockcard.entity.StockTimeline;
import com.stockcard.repository.CategoryRepository;
import com.stockcard.repository.EarningsReportRepository;
import com.stockcard.repository.StockDocumentRepository;
import com.stockcard.repository.StockRepository;
import com.stockcard.repository.StockTimelineRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Import(StockService.class)
class StockServiceTest {

    @Autowired StockService stockService;
    @Autowired StockRepository stockRepository;
    @Autowired CategoryRepository categoryRepository;
    @Autowired StockTimelineRepository timelineRepository;
    @Autowired StockDocumentRepository documentRepository;
    @Autowired EarningsReportRepository earningsRepository;

    private Stock newStock(String code, String name) {
        Stock s = new Stock();
        s.setCode(code);
        s.setName(name);
        return stockService.create(s);
    }

    private Category newCategory(String name) {
        Category c = new Category();
        c.setName(name);
        return categoryRepository.save(c);
    }

    private List<String> timelineActions(Long stockId) {
        return timelineRepository.findByStockIdOrderByCreatedAtDesc(stockId).stream()
                .map(StockTimeline::getActionType).toList();
    }

    private List<String> timelineDescriptions(Long stockId) {
        return timelineRepository.findByStockIdOrderByCreatedAtDesc(stockId).stream()
                .map(StockTimeline::getDescription).toList();
    }

    // ── create / update ───────────────────────────────────────────────────────

    @Test
    void createRecordsTimelineEntry() {
        Stock s = newStock("600519", "贵州茅台");

        assertThat(s.getId()).isNotNull();
        assertThat(s.getMarket()).isEqualTo("CN");
        assertThat(timelineActions(s.getId())).containsExactly("CREATE");
    }

    @Test
    void updateRecordsOnlyFieldsThatActuallyChanged() {
        Stock s = newStock("600519", "贵州茅台");

        Stock details = new Stock();
        details.setCode("600519");
        details.setName("贵州茅台");
        details.setBusiness("白酒");
        details.setNotes("  "); // blank is treated as unchanged from null
        stockService.update(s.getId(), details);

        assertThat(timelineDescriptions(s.getId())).contains("更新公司信息：业务");
    }

    @Test
    void updateWithoutChangesIsRecordedAsUnchanged() {
        Stock s = newStock("600519", "贵州茅台");

        Stock details = new Stock();
        details.setCode(" 600519 ");
        details.setName("贵州茅台");
        stockService.update(s.getId(), details);

        assertThat(timelineDescriptions(s.getId())).contains("更新公司信息（字段未变化）");
    }

    @Test
    void updateKeepsMarketWhenNotProvided() {
        Stock s = newStock("AAPL", "Apple");
        s.setMarket("US");
        stockRepository.save(s);

        Stock details = new Stock();
        details.setCode("AAPL");
        details.setName("Apple Inc.");
        details.setMarket(null);
        Stock updated = stockService.update(s.getId(), details).orElseThrow();

        assertThat(updated.getMarket()).isEqualTo("US");
        assertThat(updated.getName()).isEqualTo("Apple Inc.");
    }

    @Test
    void createAppliesDefaultsForMissingMarketAndRating() {
        Stock s = new Stock();
        s.setCode("1");
        s.setName("n");
        s.setMarket(null);
        s.setResearchValue(null);

        Stock saved = stockService.create(s);

        assertThat(saved.getMarket()).isEqualTo("CN");
        assertThat(saved.getResearchValue()).isZero();
    }

    @Test
    void updateUnknownStockReturnsEmpty() {
        assertThat(stockService.update(9999L, new Stock())).isEmpty();
    }

    // ── archive ───────────────────────────────────────────────────────────────

    @Test
    void archivedStocksAreHiddenFromDefaultListAndCanBeRestored() {
        Stock keep = newStock("000001", "平安银行");
        Stock archived = newStock("000002", "万科A");

        Stock result = stockService.setArchived(archived.getId(), true).orElseThrow();
        assertThat(result.isArchived()).isTrue();
        assertThat(result.getArchivedAt()).isNotNull();
        assertThat(stockService.findAll()).extracting(Stock::getId).containsExactly(keep.getId());
        assertThat(stockService.findArchived()).extracting(Stock::getId).containsExactly(archived.getId());

        Stock restored = stockService.setArchived(archived.getId(), false).orElseThrow();
        assertThat(restored.getArchivedAt()).isNull();
        assertThat(stockService.findAll()).hasSize(2);
        assertThat(timelineActions(archived.getId())).filteredOn("ARCHIVE"::equals).hasSize(2);
    }

    // ── categories & filter ───────────────────────────────────────────────────

    @Test
    void filterSupportsUnionAndIntersection() {
        Category liquor = newCategory("白酒");
        Category consumer = newCategory("消费");
        Stock both = newStock("600519", "贵州茅台");
        Stock onlyLiquor = newStock("000858", "五粮液");
        Stock none = newStock("000001", "平安银行");

        stockService.setCategories(both.getId(), Set.of(liquor.getId(), consumer.getId()));
        stockService.setCategories(onlyLiquor.getId(), Set.of(liquor.getId()));

        Set<Long> ids = Set.of(liquor.getId(), consumer.getId());
        assertThat(stockService.filter(ids, "union")).extracting(Stock::getId)
                .containsExactlyInAnyOrder(both.getId(), onlyLiquor.getId());
        assertThat(stockService.filter(ids, "intersection")).extracting(Stock::getId)
                .containsExactly(both.getId());
        assertThat(stockService.filter(Set.of(), "union")).extracting(Stock::getId)
                .contains(none.getId());
    }

    @Test
    void filterExcludesArchivedStocks() {
        Category liquor = newCategory("白酒");
        Stock s = newStock("600519", "贵州茅台");
        stockService.setCategories(s.getId(), Set.of(liquor.getId()));
        stockService.setArchived(s.getId(), true);

        assertThat(stockService.filter(Set.of(liquor.getId()), "union")).isEmpty();
        assertThat(stockService.filter(Set.of(liquor.getId()), "intersection")).isEmpty();
    }

    @Test
    void setCategoriesRecordsSortedNamesInTimeline() {
        Category a = newCategory("消费");
        Category b = newCategory("白酒");
        Stock s = newStock("600519", "贵州茅台");

        stockService.setCategories(s.getId(), Set.of(a.getId(), b.getId()));
        stockService.setCategories(s.getId(), Set.of());

        List<String> descriptions = timelineDescriptions(s.getId());
        assertThat(descriptions).anyMatch(d -> d.startsWith("更新分类为：") && d.contains("白酒") && d.contains("消费"));
        assertThat(descriptions).contains("清空分类");
    }

    // ── search ────────────────────────────────────────────────────────────────

    @Test
    void searchMatchesProfileFieldsCaseInsensitively() {
        Stock s = newStock("NVDA", "Nvidia");
        s.setBusiness("GPU and AI accelerators");
        stockRepository.save(s);
        newStock("AAPL", "Apple");

        assertThat(stockService.search("gpu")).extracting(Stock::getId).containsExactly(s.getId());
        assertThat(stockService.search("nvd")).extracting(Stock::getId).containsExactly(s.getId());
    }

    @Test
    void searchMatchesDocumentContentTimelineAndEarnings() {
        Stock byDoc = newStock("600519", "贵州茅台");
        Stock byTimeline = newStock("000858", "五粮液");
        Stock byEarnings = newStock("000568", "泸州老窖");
        newStock("000001", "平安银行");

        StockDocument doc = new StockDocument();
        doc.setTitle("调研纪要");
        doc.setContent("渠道库存健康");
        stockService.createDocument(byDoc.getId(), doc);

        // Only the timeline still mentions the keyword once the document is gone.
        StockDocument removed = new StockDocument();
        removed.setTitle("渠道库存跟踪");
        removed.setContent("x");
        Long removedId = stockService.createDocument(byTimeline.getId(), removed).orElseThrow().getId();
        stockService.deleteDocument(byTimeline.getId(), removedId);

        EarningsReport report = new EarningsReport();
        report.setTitle("2025 年报 渠道库存 下降");
        stockService.createEarnings(byEarnings.getId(), report);

        assertThat(stockService.search("渠道库存")).extracting(Stock::getId)
                .containsExactlyInAnyOrder(byDoc.getId(), byTimeline.getId(), byEarnings.getId());
    }

    @Test
    void searchTreatsLikeWildcardsInInputLiterally() {
        Stock percent = newStock("A1", "增长50%公司");
        Stock plain = newStock("A2", "增长500公司");
        Stock underscore = newStock("B_1", "b one");
        newStock("BX1", "bx one");

        assertThat(stockService.search("50%")).extracting(Stock::getId).containsExactly(percent.getId());
        assertThat(stockService.search("500")).extracting(Stock::getId).containsExactly(plain.getId());
        assertThat(stockService.search("b_1")).extracting(Stock::getId).containsExactly(underscore.getId());
    }

    @Test
    void searchIncludesIndustryPosition() {
        Stock s = newStock("300750", "宁德时代");
        s.setIndustryPosition("动力电池全球市占率第一");
        stockRepository.save(s);

        assertThat(stockService.search("市占率第一")).extracting(Stock::getId).containsExactly(s.getId());
    }

    @Test
    void searchExcludesArchivedAndBlankKeywordReturnsAllActive() {
        Stock active = newStock("600519", "贵州茅台");
        Stock archived = newStock("600520", "贵州茅台二号");
        stockService.setArchived(archived.getId(), true);

        assertThat(stockService.search("茅台")).extracting(Stock::getId).containsExactly(active.getId());
        assertThat(stockService.search("   ")).extracting(Stock::getId).containsExactly(active.getId());
    }

    // ── documents / earnings ownership ─────────────────────────────────────────

    @Test
    void documentOperationsRequireMatchingStock() {
        Stock owner = newStock("600519", "贵州茅台");
        Stock other = newStock("000858", "五粮液");

        StockDocument payload = new StockDocument();
        payload.setTitle("  标题  ");
        payload.setContent("内容");
        payload.setCategory(" 调研 ");
        StockDocument doc = stockService.createDocument(owner.getId(), payload).orElseThrow();
        assertThat(doc.getTitle()).isEqualTo("标题");
        assertThat(doc.getCategory()).isEqualTo("调研");
        assertThat(doc.getStockCode()).isEqualTo("600519");

        assertThat(stockService.updateDocument(other.getId(), doc.getId(), payload)).isEmpty();
        assertThat(stockService.deleteDocument(other.getId(), doc.getId())).isFalse();
        assertThat(stockService.deleteDocument(owner.getId(), doc.getId())).isTrue();
        assertThat(stockService.listDocuments(owner.getId()).orElseThrow()).isEmpty();
    }

    @Test
    void listingForUnknownStockReturnsEmptyOptional() {
        assertThat(stockService.listDocuments(9999L)).isEmpty();
        assertThat(stockService.listEarnings(9999L)).isEmpty();
        assertThat(stockService.getTimeline(9999L)).isEmpty();
    }

    // ── delete ────────────────────────────────────────────────────────────────

    @Test
    void deleteRemovesDependentDocumentsAndEarningsButKeepsTimeline() {
        Stock s = newStock("600519", "贵州茅台");
        StockDocument doc = new StockDocument();
        doc.setTitle("t");
        doc.setContent("c");
        stockService.createDocument(s.getId(), doc);
        EarningsReport report = new EarningsReport();
        report.setTitle("Q1");
        stockService.createEarnings(s.getId(), report);

        assertThat(stockService.delete(s.getId())).isTrue();

        assertThat(stockRepository.findById(s.getId())).isEmpty();
        assertThat(documentRepository.findByStockIdOrderByCreatedAtDesc(s.getId())).isEmpty();
        assertThat(earningsRepository.findByStockIdOrderByReportDateDescCreatedAtDesc(s.getId())).isEmpty();
        assertThat(timelineActions(s.getId())).contains("DELETE");
        assertThat(stockService.delete(s.getId())).isFalse();
    }
}
