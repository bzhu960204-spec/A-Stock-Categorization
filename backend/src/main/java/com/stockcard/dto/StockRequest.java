package com.stockcard.dto;

import com.stockcard.entity.Stock;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Editable stock fields for create/update. Server-managed fields (id, archived, categories) are deliberately absent;
 * unknown JSON properties sent by the client are ignored.
 */
public record StockRequest(
        @NotBlank @Size(max = 255) String code,
        @NotBlank @Size(max = 255) String name,
        @Size(max = 1000) String notes,
        @Size(max = 10) String market,
        @Min(0) @Max(5) Integer researchValue,
        @Size(max = 100) String recommender,
        String business,
        String customers,
        String competitors,
        String strengths,
        String structuralWeaknesses,
        String future,
        String founderCeoHolding,
        String industryPosition
) {
    public Stock toEntity() {
        Stock s = new Stock();
        s.setCode(code.trim());
        s.setName(name.trim());
        s.setNotes(notes);
        // null = "not provided": create() applies defaults, update() keeps the current value.
        s.setMarket(market == null || market.isBlank() ? null : market.trim());
        s.setResearchValue(researchValue);
        s.setRecommender(recommender);
        s.setBusiness(business);
        s.setCustomers(customers);
        s.setCompetitors(competitors);
        s.setStrengths(strengths);
        s.setStructuralWeaknesses(structuralWeaknesses);
        s.setFuture(future);
        s.setFounderCeoHolding(founderCeoHolding);
        s.setIndustryPosition(industryPosition);
        return s;
    }
}
