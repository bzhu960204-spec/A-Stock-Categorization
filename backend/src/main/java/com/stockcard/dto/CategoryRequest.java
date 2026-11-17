package com.stockcard.dto;

import com.stockcard.entity.Category;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CategoryRequest(
        @NotBlank @Size(max = 255) String name,
        @Size(max = 255) String color,
        @Size(max = 500) String description
) {
    public Category toEntity() {
        Category c = new Category();
        c.setName(name.trim());
        c.setColor(color);
        c.setDescription(description);
        return c;
    }
}
