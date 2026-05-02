package com.stockcard;

import com.stockcard.repository.StockRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class StockClassifierApplication {
    public static void main(String[] args) {
        SpringApplication.run(StockClassifierApplication.class, args);
    }

    @Bean
    CommandLineRunner migrateMarket(StockRepository stockRepository) {
        return args -> {
            stockRepository.findAll().forEach(stock -> {
                if (stock.getMarket() == null || stock.getMarket().isBlank()) {
                    stock.setMarket("CN");
                    stockRepository.save(stock);
                }
            });
        };
    }
}
