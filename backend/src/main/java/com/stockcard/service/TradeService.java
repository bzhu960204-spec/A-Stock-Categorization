package com.stockcard.service;

import com.stockcard.entity.Trade;
import com.stockcard.entity.TradeCategory;
import com.stockcard.repository.TradeCategoryRepository;
import com.stockcard.repository.TradeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class TradeService {

    private final TradeCategoryRepository categoryRepository;
    private final TradeRepository tradeRepository;

    public enum CategoryDeleteResult { NOT_FOUND, HAS_TRADES, DELETED }

    // ── Categories ────────────────────────────────────────────────────────────

    public List<TradeCategory> getAllCategories() {
        return categoryRepository.findAll();
    }

    /** empty = a category with this name already exists (conflict). */
    public Optional<TradeCategory> createCategory(String name) {
        if (categoryRepository.existsByName(name)) {
            return Optional.empty();
        }
        TradeCategory cat = new TradeCategory();
        cat.setName(name);
        return Optional.of(categoryRepository.save(cat));
    }

    public Optional<TradeCategory> updateCategory(Long id, String name) {
        return categoryRepository.findById(id).map(cat -> {
            if (name != null && !name.isBlank()) {
                cat.setName(name.trim());
            }
            return categoryRepository.save(cat);
        });
    }

    @Transactional
    public CategoryDeleteResult deleteCategory(Long id) {
        if (!categoryRepository.existsById(id)) {
            return CategoryDeleteResult.NOT_FOUND;
        }
        if (tradeRepository.countByCategoryId(id) > 0) {
            return CategoryDeleteResult.HAS_TRADES;
        }
        categoryRepository.deleteById(id);
        return CategoryDeleteResult.DELETED;
    }

    // ── Trades ────────────────────────────────────────────────────────────────

    public List<Trade> getAll(Long categoryId) {
        if (categoryId != null) {
            return tradeRepository.findByCategoryIdOrderByCreatedAtDesc(categoryId);
        }
        return tradeRepository.findAllByOrderByCreatedAtDesc();
    }

    public List<Trade> search(String pattern) {
        return tradeRepository.searchByKeyword(pattern);
    }

    public Trade create(String title, String content, String subCategory, Integer rating, Long categoryId) {
        Trade trade = new Trade();
        trade.setTitle(title.trim());
        trade.setContent(content);
        trade.setSubCategory(subCategory);
        if (rating != null) trade.setRating(Math.max(0, Math.min(5, rating)));
        if (categoryId != null) {
            categoryRepository.findById(categoryId).ifPresent(trade::setCategory);
        }
        return tradeRepository.save(trade);
    }

    public Optional<Trade> update(Long id, String title, String content, String subCategory, Integer rating, Long categoryId) {
        return tradeRepository.findById(id).map(trade -> {
            if (title != null && !title.isBlank()) {
                trade.setTitle(title.trim());
            }
            trade.setContent(content);
            trade.setSubCategory(subCategory);
            if (rating != null) trade.setRating(Math.max(0, Math.min(5, rating)));
            if (categoryId != null) {
                categoryRepository.findById(categoryId).ifPresent(trade::setCategory);
            } else {
                trade.setCategory(null);
            }
            return tradeRepository.save(trade);
        });
    }

    public Optional<Trade> updateRating(Long id, int rating) {
        return tradeRepository.findById(id).map(trade -> {
            trade.setRating(rating);
            return tradeRepository.save(trade);
        });
    }

    public boolean delete(Long id) {
        return tradeRepository.findById(id).map(trade -> {
            tradeRepository.delete(trade);
            return true;
        }).orElse(false);
    }
}
