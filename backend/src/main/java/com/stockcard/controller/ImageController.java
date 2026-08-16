package com.stockcard.controller;

import com.stockcard.entity.StockImage;
import com.stockcard.service.ImageService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/images")
public class ImageController {

    private final ImageService imageService;

    public ImageController(ImageService imageService) {
        this.imageService = imageService;
    }

    /** Upload an image; returns {"id": 42, "url": "/api/images/42"} */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> upload(@RequestParam("file") MultipartFile file) throws IOException {
        String ct = file.getContentType();
        if (ct == null || !ct.startsWith("image/")) {
            return ResponseEntity.badRequest().build();
        }
        StockImage saved = imageService.save(ct, file.getBytes());
        return ResponseEntity.ok(Map.of(
                "id", saved.getId(),
                "url", "/api/images/" + saved.getId()
        ));
    }

    /** Serve an image by id */
    @GetMapping("/{id}")
    public ResponseEntity<byte[]> get(@PathVariable Long id) {
        return imageService.get(id)
                .map(img -> ResponseEntity.ok()
                        .header(HttpHeaders.CACHE_CONTROL, "public, max-age=31536000, immutable")
                        .contentType(MediaType.parseMediaType(img.getContentType()))
                        .body(img.getData()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
