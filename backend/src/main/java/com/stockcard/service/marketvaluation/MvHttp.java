package com.stockcard.service.marketvaluation;

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
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * GET helper shared by the market valuation clients: retries transient failures, spaces out requests per host and never
 * leaks an API key into messages.
 */
@Component
public class MvHttp {

    private static final Logger log = LoggerFactory.getLogger(MvHttp.class);
    private static final Pattern API_KEY = Pattern.compile("(?i)api_key=[^&\\s\"']*");
    private static final String FACTSET_HOST = "advantage.factset.com";

    private final RestTemplate restTemplate;
    private final ObjectMapper mapper;
    private final int retries;
    private final long retryDelayMs;
    private final long defaultIntervalMs;
    private final long factsetIntervalMs;
    private final Map<String, Long> lastRequestAt = new HashMap<>();

    @Autowired
    public MvHttp(@Qualifier("marketValuationRestTemplate") RestTemplate restTemplate, ObjectMapper mapper) {
        this(restTemplate, mapper, 2, 2000, 1000, 1500);
    }

    MvHttp(RestTemplate restTemplate, ObjectMapper mapper, int retries, long retryDelayMs, long defaultIntervalMs, long factsetIntervalMs) {
        this.restTemplate = restTemplate;
        this.mapper = mapper;
        this.retries = retries;
        this.retryDelayMs = retryDelayMs;
        this.defaultIntervalMs = defaultIntervalMs;
        this.factsetIntervalMs = factsetIntervalMs;
    }

    /** Replaces the value of any {@code api_key=...} parameter with {@code ***}. */
    public static String redact(String text) {
        return text == null ? null : API_KEY.matcher(text).replaceAll("api_key=***");
    }

    /** The URI is passed as-is (not a template), so already-encoded characters such as %5E are not encoded twice. */
    public JsonNode getJson(URI uri) {
        try {
            return mapper.readTree(getText(uri));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Invalid JSON from " + describe(uri));
        }
    }

    /** Decodes the body as UTF-8 (servers may omit the charset), dropping a leading BOM. */
    public String getText(URI uri) {
        String body = new String(getBytes(uri), StandardCharsets.UTF_8);
        return body.startsWith("\uFEFF") ? body.substring(1) : body;
    }

    public byte[] getBytes(URI uri) {
        byte[] body = fetch(uri, false);
        if (body == null) throw new IllegalStateException("Empty response from " + describe(uri));
        return body;
    }

    /** Like {@link #getBytes} but a 404 yields null (FactSet probes several candidate file names). */
    public byte[] getBytesOrNull(URI uri) {
        return fetch(uri, true);
    }

    private byte[] fetch(URI uri, boolean nullOn404) {
        RuntimeException last = null;
        for (int attempt = 0; attempt <= retries; attempt++) {
            throttle(uri.getHost());
            try {
                byte[] body = restTemplate.getForObject(uri, byte[].class);
                if (body == null || body.length == 0) throw new IllegalStateException("Empty response from " + describe(uri));
                return body;
            } catch (HttpClientErrorException e) {
                if (nullOn404 && e.getStatusCode() == HttpStatus.NOT_FOUND) return null;
                if (e.getStatusCode() != HttpStatus.TOO_MANY_REQUESTS) throw new IllegalStateException(failure(uri, e));
                last = new IllegalStateException(failure(uri, e));
            } catch (HttpStatusCodeException e) {
                last = new IllegalStateException(failure(uri, e));
            } catch (RestClientException e) {
                last = new IllegalStateException("Request to " + describe(uri) + " failed: " + redact(e.getMessage()));
            }
            if (attempt < retries) {
                log.warn("{} (attempt {}/{}), retrying", last.getMessage(), attempt + 1, retries + 1);
                sleep(retryDelayMs);
            }
        }
        throw last;
    }

    /** Waits until the host's minimum request interval has passed; the sync is single-threaded so contention is not a concern. */
    private void throttle(String host) {
        long interval = FACTSET_HOST.equals(host) ? factsetIntervalMs : defaultIntervalMs;
        if (interval > 0) {
            synchronized (lastRequestAt) {
                long wait = lastRequestAt.getOrDefault(host, 0L) + interval - System.currentTimeMillis();
                if (wait > 0) sleep(wait);
                lastRequestAt.put(host, System.currentTimeMillis());
            }
        }
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

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting");
        }
    }
}
