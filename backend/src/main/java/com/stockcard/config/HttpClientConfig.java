package com.stockcard.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.net.InetSocketAddress;
import java.net.Proxy;
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

    /** Longer read timeout for the liquidity monitor: historical back-fills return a few hundred KB per request. */
    @Bean
    public RestTemplate liquidityRestTemplate(RestTemplateBuilder builder,
                                              @Value("${app.http.connect-timeout:5s}") Duration connectTimeout,
                                              @Value("${app.liquidity.read-timeout:60s}") Duration readTimeout) {
        return builder
                .setConnectTimeout(connectTimeout)
                .setReadTimeout(readTimeout)
                .defaultHeader("User-Agent", "stock-card/1.0")
                .build();
    }

    /**
     * Market valuation monitor: multpl / worldperatio / Yahoo reject non-browser agents, FactSet PDFs are ~1 MB each.
     * {@code app.market-valuation.proxy=host:port} routes only this module through an HTTP proxy (Yahoo is blocked from some networks).
     */
    @Bean
    public RestTemplate marketValuationRestTemplate(RestTemplateBuilder builder,
                                                    @Value("${app.http.connect-timeout:5s}") Duration connectTimeout,
                                                    @Value("${app.market-valuation.read-timeout:60s}") Duration readTimeout,
                                                    @Value("${app.market-valuation.proxy:}") String proxy) {
        RestTemplateBuilder configured = builder
                .setConnectTimeout(connectTimeout)
                .setReadTimeout(readTimeout)
                .defaultHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 stock-card/1.0");
        if (!proxy.isBlank()) {
            int colon = proxy.lastIndexOf(':');
            if (colon <= 0) throw new IllegalStateException("app.market-valuation.proxy 必须是 host:port");
            SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
            factory.setProxy(new Proxy(Proxy.Type.HTTP, new InetSocketAddress(proxy.substring(0, colon).trim(), Integer.parseInt(proxy.substring(colon + 1).trim()))));
            factory.setConnectTimeout((int) connectTimeout.toMillis());
            factory.setReadTimeout((int) readTimeout.toMillis());
            configured = configured.requestFactory(() -> factory);
        }
        return configured.build();
    }
}
