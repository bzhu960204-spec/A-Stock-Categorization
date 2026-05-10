package com.stockcard.controller;

import com.stockcard.entity.IndustryChain;
import com.stockcard.repository.IndustryChainRepository;
import com.stockcard.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/stocks/{stockId}/industry-chains")
@RequiredArgsConstructor
public class IndustryChainController {

    private final IndustryChainRepository industryChainRepository;
    private final StockRepository stockRepository;

    @GetMapping
    public ResponseEntity<List<IndustryChain>> getIndustryChains(@PathVariable Long stockId) {
        if (!stockRepository.existsById(stockId)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(industryChainRepository.findByStockIdOrderByCreatedAtAsc(stockId));
    }

    @PostMapping
    public ResponseEntity<IndustryChain> createIndustryChain(
            @PathVariable Long stockId,
            @RequestBody IndustryChain payload) {

        if (payload == null || isBlank(payload.getTitle()) || isBlank(payload.getContent())) {
            return ResponseEntity.badRequest().build();
        }

        return stockRepository.findById(stockId)
                .map(stock -> {
                    IndustryChain chain = new IndustryChain();
                    chain.setStockId(stock.getId());
                    chain.setTitle(payload.getTitle().trim());
                    chain.setContent(payload.getContent().trim());
                    return ResponseEntity.ok(industryChainRepository.save(chain));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{chainId}")
    public ResponseEntity<IndustryChain> updateIndustryChain(
            @PathVariable Long stockId,
            @PathVariable Long chainId,
            @RequestBody IndustryChain payload) {

        if (payload == null || isBlank(payload.getTitle()) || isBlank(payload.getContent())) {
            return ResponseEntity.badRequest().build();
        }

        return industryChainRepository.findById(chainId)
                .filter(chain -> chain.getStockId().equals(stockId))
                .map(chain -> {
                    chain.setTitle(payload.getTitle().trim());
                    chain.setContent(payload.getContent().trim());
                    return ResponseEntity.ok(industryChainRepository.save(chain));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{chainId}")
    public ResponseEntity<Void> deleteIndustryChain(
            @PathVariable Long stockId,
            @PathVariable Long chainId) {

        return industryChainRepository.findById(chainId)
                .filter(chain -> chain.getStockId().equals(stockId))
                .map(chain -> {
                    industryChainRepository.delete(chain);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
