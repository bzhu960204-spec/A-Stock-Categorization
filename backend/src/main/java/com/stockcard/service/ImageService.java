package com.stockcard.service;

import com.stockcard.entity.StockImage;
import com.stockcard.repository.StockImageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@RequiredArgsConstructor
public class ImageService {

    private final StockImageRepository repo;

    public StockImage save(String contentType, byte[] data) {
        StockImage img = new StockImage();
        img.setContentType(contentType);
        img.setData(data);
        return repo.save(img);
    }

    public Optional<StockImage> get(Long id) {
        return repo.findById(id);
    }
}
