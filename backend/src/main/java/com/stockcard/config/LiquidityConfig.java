package com.stockcard.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Configuration
public class LiquidityConfig {

    /** Single worker: at most one liquidity sync runs at a time; shut down together with the application context. */
    @Bean(destroyMethod = "shutdown")
    public ExecutorService liquiditySyncExecutor() {
        return Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "liquidity-sync");
            thread.setDaemon(true);
            return thread;
        });
    }
}
