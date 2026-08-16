package com.stockcard.service;

import com.stockcard.entity.Category;
import com.stockcard.entity.Stock;
import com.stockcard.repository.CategoryRepository;
import com.stockcard.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final StockRepository stockRepository;

    public List<Category> findAll() {
        return categoryRepository.findAll();
    }

    public Category create(Category category) {
        return categoryRepository.save(category);
    }

    public Optional<Category> update(Long id, Category details) {
        return categoryRepository.findById(id).map(category -> {
            category.setName(details.getName());
            category.setColor(details.getColor());
            category.setDescription(details.getDescription());
            return categoryRepository.save(category);
        });
    }

    @Transactional
    public void delete(Long id) {
        List<Stock> affected = stockRepository.findByAnyCategoryIds(Set.of(id));
        for (Stock stock : affected) {
            stock.getCategories().removeIf(cat -> cat.getId().equals(id));
            stockRepository.save(stock);
        }
        categoryRepository.deleteById(id);
    }
}
