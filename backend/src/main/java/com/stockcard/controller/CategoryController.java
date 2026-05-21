package com.stockcard.controller;

import com.stockcard.entity.Category;
import com.stockcard.entity.Stock;
import com.stockcard.repository.CategoryRepository;
import com.stockcard.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryRepository categoryRepository;
    private final StockRepository stockRepository;

    @GetMapping
    public List<Category> getAllCategories() {
        return categoryRepository.findAll();
    }

    @PostMapping
    public Category createCategory(@RequestBody Category category) {
        return categoryRepository.save(category);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Category> updateCategory(@PathVariable Long id, @RequestBody Category categoryDetails) {
        return categoryRepository.findById(id)
                .map(category -> {
                    category.setName(categoryDetails.getName());
                    category.setColor(categoryDetails.getColor());
                    category.setDescription(categoryDetails.getDescription());
                    return ResponseEntity.ok(categoryRepository.save(category));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCategory(@PathVariable Long id) {
        // Remove association from all stocks before deleting
        List<Stock> affected = stockRepository.findByAnyCategoryIds(Set.of(id));
        for (Stock stock : affected) {
            stock.getCategories().removeIf(cat -> cat.getId().equals(id));
            stockRepository.save(stock);
        }
        categoryRepository.deleteById(id);
        return ResponseEntity.ok().build();
    }
}
