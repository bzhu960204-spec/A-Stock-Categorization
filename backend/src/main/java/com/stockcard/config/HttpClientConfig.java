package com.stockcard.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/** Shared HTTP client for external data sources; timeouts keep a slow upstream from tying up request threads. */
@Configuration
public class HttpClientConfig {

    @Bean
    public RestTemplate externalRestTemplate(RestTemplateBuilder builder,
                                             @Value("${app.http.connect-timeout:5s}") Duration connectTimeout,
                                             @Value("${app.http.read-timeout:15s}") Duration readTimeout) {
        return builder
                .setConnectTimeout(connectTimeout)
                .setReadTimeout(readTimeout)
                .build();
    }
}
