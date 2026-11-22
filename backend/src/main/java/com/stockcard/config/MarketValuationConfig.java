package com.stockcard.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Configuration
public class MarketValuationConfig {

    /** Single worker: at most one market valuation sync runs at a time; shut down together with the application context. */
    @Bean(destroyMethod = "shutdown")
    public ExecutorService marketValuationSyncExecutor() {
        return Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "market-valuation-sync");
            thread.setDaemon(true);
            return thread;
        });
    }
}
