package com.stockcard.controller;

import com.stockcard.entity.IndustryChain;
import com.stockcard.service.IndustryChainService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/stocks/{stockId}/industry-chains")
@RequiredArgsConstructor
public class IndustryChainController {

    private final IndustryChainService industryChainService;

    @GetMapping
    public ResponseEntity<List<IndustryChain>> getIndustryChains(@PathVariable Long stockId) {
        return industryChainService.list(stockId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<IndustryChain> createIndustryChain(
            @PathVariable Long stockId,
            @RequestBody IndustryChain payload) {
        if (payload == null || isBlank(payload.getTitle()) || isBlank(payload.getContent())) {
            return ResponseEntity.badRequest().build();
        }
        return industryChainService.create(stockId, payload)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/{chainId}")
    public ResponseEntity<IndustryChain> updateIndustryChain(
            @PathVariable Long stockId,
            @PathVariable Long chainId,
            @RequestBody IndustryChain payload) {
        if (payload == null || isBlank(payload.getTitle()) || isBlank(payload.getContent())) {
            return ResponseEntity.badRequest().build();
        }
        return industryChainService.update(stockId, chainId, payload)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{chainId}")
    public ResponseEntity<Void> deleteIndustryChain(
            @PathVariable Long stockId,
            @PathVariable Long chainId) {
        return industryChainService.delete(stockId, chainId)
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
