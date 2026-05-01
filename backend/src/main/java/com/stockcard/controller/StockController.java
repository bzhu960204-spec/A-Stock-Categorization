package com.stockcard.controller;

import com.stockcard.entity.Category;
import com.stockcard.entity.Stock;
import com.stockcard.repository.CategoryRepository;
import com.stockcard.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/stocks")
@RequiredArgsConstructor
@CrossOrigin(origins = "http://localhost:5173")
public class StockController {

    private final StockRepository stockRepository;
    private final CategoryRepository categoryRepository;

    @GetMapping
    public List<Stock> getAllStocks() {
        return stockRepository.findAll();
    }

    @PostMapping
    public Stock createStock(@RequestBody Stock stock) {
        return stockRepository.save(stock);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Stock> updateStock(@PathVariable Long id, @RequestBody Stock stockDetails) {
        return stockRepository.findById(id)
                .map(stock -> {
                    stock.setName(stockDetails.getName());
                    stock.setCode(stockDetails.getCode());
                    stock.setNotes(stockDetails.getNotes());
                    stock.setBusiness(stockDetails.getBusiness());
                    stock.setCustomers(stockDetails.getCustomers());
                    stock.setCompetitors(stockDetails.getCompetitors());
                    stock.setStrengths(stockDetails.getStrengths());
                    stock.setStructuralWeaknesses(stockDetails.getStructuralWeaknesses());
                    stock.setFuture(stockDetails.getFuture());
                    stock.setFounderCeoHolding(stockDetails.getFounderCeoHolding());
                    return ResponseEntity.ok(stockRepository.save(stock));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteStock(@PathVariable Long id) {
        stockRepository.deleteById(id);
        return ResponseEntity.ok().build();
    }

    // 给股票设置分类
    @PutMapping("/{id}/categories")
    public ResponseEntity<Stock> setCategories(@PathVariable Long id, @RequestBody Set<Long> categoryIds) {
        return stockRepository.findById(id)
                .map(stock -> {
                    Set<Category> categories = new HashSet<>(categoryRepository.findAllById(categoryIds));
                    stock.setCategories(categories);
                    return ResponseEntity.ok(stockRepository.save(stock));
                })
                .orElse(ResponseEntity.notFound().build());
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

    // 搜索股票
    @GetMapping("/search")
    public List<Stock> searchStocks(@RequestParam String keyword) {
        List<Stock> byName = stockRepository.findByNameContaining(keyword);
        stockRepository.findByCode(keyword).ifPresent(s -> {
            if (byName.stream().noneMatch(st -> st.getId().equals(s.getId()))) {
                byName.add(0, s);
            }
        });
        return byName;
    }
}
