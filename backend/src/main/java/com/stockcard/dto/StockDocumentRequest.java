package com.stockcard.dto;

import com.stockcard.entity.StockDocument;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record StockDocumentRequest(
        @NotBlank @Size(max = 200) String title,
        @NotBlank String content,
        @Size(max = 100) String category
) {
    public StockDocument toEntity() {
        StockDocument d = new StockDocument();
        d.setTitle(title);
        d.setContent(content);
        d.setCategory(category);
        return d;
    }
}
