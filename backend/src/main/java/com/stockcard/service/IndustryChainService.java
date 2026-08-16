package com.stockcard.service;

import com.stockcard.entity.IndustryChain;
import com.stockcard.repository.IndustryChainRepository;
import com.stockcard.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class IndustryChainService {

    private final IndustryChainRepository industryChainRepository;
    private final StockRepository stockRepository;

    public Optional<List<IndustryChain>> list(Long stockId) {
        if (!stockRepository.existsById(stockId)) {
            return Optional.empty();
        }
        return Optional.of(industryChainRepository.findByStockIdOrderByCreatedAtAsc(stockId));
    }

    @Transactional
    public Optional<IndustryChain> create(Long stockId, IndustryChain payload) {
        return stockRepository.findById(stockId).map(stock -> {
            IndustryChain chain = new IndustryChain();
            chain.setStockId(stock.getId());
            chain.setTitle(payload.getTitle().trim());
            chain.setContent(payload.getContent().trim());
            return industryChainRepository.save(chain);
        });
    }

    @Transactional
    public Optional<IndustryChain> update(Long stockId, Long chainId, IndustryChain payload) {
        return industryChainRepository.findById(chainId)
                .filter(chain -> chain.getStockId().equals(stockId))
                .map(chain -> {
                    chain.setTitle(payload.getTitle().trim());
                    chain.setContent(payload.getContent().trim());
                    return industryChainRepository.save(chain);
                });
    }

    @Transactional
    public boolean delete(Long stockId, Long chainId) {
        return industryChainRepository.findById(chainId)
                .filter(chain -> chain.getStockId().equals(stockId))
                .map(chain -> {
                    industryChainRepository.delete(chain);
                    return true;
                })
                .orElse(false);
    }
}
