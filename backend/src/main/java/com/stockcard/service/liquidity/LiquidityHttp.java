package com.stockcard.service.liquidity;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Pattern;

/** GET-and-parse helper shared by the clients: retries transient failures and never leaks an API key into messages. */
@Component
public class LiquidityHttp {

    private static final Logger log = LoggerFactory.getLogger(LiquidityHttp.class);
    private static final Pattern API_KEY = Pattern.compile("(?i)api_key=[^&\\s\"']*");

    private final RestTemplate restTemplate;
    private final ObjectMapper mapper;
    private final int retries;
    private final long retryDelayMs;

    @Autowired
    public LiquidityHttp(@Qualifier("liquidityRestTemplate") RestTemplate restTemplate, ObjectMapper mapper) {
        this(restTemplate, mapper, 2, 2000);
    }

    LiquidityHttp(RestTemplate restTemplate, ObjectMapper mapper, int retries, long retryDelayMs) {
        this.restTemplate = restTemplate;
        this.mapper = mapper;
        this.retries = retries;
        this.retryDelayMs = retryDelayMs;
    }

    /** Replaces the value of any {@code api_key=...} parameter with {@code ***}. */
    public static String redact(String text) {
        return text == null ? null : API_KEY.matcher(text).replaceAll("api_key=***");
    }

    /** The URI is passed as-is (not a template), so already-encoded characters such as %5B are not encoded twice. */
    public JsonNode getJson(URI uri) {
        String body = fetchBody(uri, false);
        try {
            return mapper.readTree(body);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Invalid JSON from " + describe(uri));
        }
    }

    /** Reads the raw bytes and decodes them as UTF-8 (servers may omit the charset), dropping a leading BOM. */
    public String getText(URI uri) {
        String body = fetchBody(uri, true);
        return body.startsWith("\uFEFF") ? body.substring(1) : body;
    }

    private String fetchBody(URI uri, boolean utf8Bytes) {
        RuntimeException last = null;
        for (int attempt = 0; attempt <= retries; attempt++) {
            try {
                String body = utf8Bytes
                        ? Optional.ofNullable(restTemplate.getForObject(uri, byte[].class)).map(b -> new String(b, StandardCharsets.UTF_8)).orElse(null)
                        : restTemplate.getForObject(uri, String.class);
                if (body == null || body.isBlank()) {
                    throw new IllegalStateException("Empty response from " + describe(uri));
                }
                return body;
            } catch (HttpClientErrorException e) {
                if (e.getStatusCode() != HttpStatus.TOO_MANY_REQUESTS) {
                    throw new IllegalStateException(failure(uri, e));
                }
                last = new IllegalStateException(failure(uri, e));
            } catch (HttpStatusCodeException e) {
                last = new IllegalStateException(failure(uri, e));
            } catch (RestClientException e) {
                last = new IllegalStateException("Request to " + describe(uri) + " failed: " + redact(e.getMessage()));
            }
            if (attempt < retries) {
                log.warn("{} (attempt {}/{}), retrying", last.getMessage(), attempt + 1, retries + 1);
                sleep();
            }
        }
        throw last;
    }

    private static String failure(URI uri, HttpStatusCodeException e) {
        String body = e.getResponseBodyAsString();
        String excerpt = body.length() > 200 ? body.substring(0, 200) : body;
        return "HTTP " + e.getStatusCode().value() + " from " + describe(uri) + (excerpt.isBlank() ? "" : ": " + redact(excerpt));
    }

    /** Host + path only; the query string may carry an API key. */
    private static String describe(URI uri) {
        return uri.getHost() + uri.getPath();
    }

    private void sleep() {
        try {
            Thread.sleep(retryDelayMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while retrying");
        }
    }
}
