package com.stockcard.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Finds base64 {@code data:image/...} URLs embedded in rich text (HTML {@code src="..."} or Markdown
 * {@code ![](...)}) and replaces each with the URL returned by a {@link Store}, e.g. {@code /api/images/42}.
 */
public final class InlineImages {

    private static final Pattern DATA_URL =
            Pattern.compile("data:(image/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})");

    /** Persists one decoded image and returns the URL that should replace it. */
    @FunctionalInterface
    public interface Store {
        String save(String contentType, byte[] data) throws Exception;
    }

    private final Store store;
    /** Identical images (same payload) are stored once per extractor instance. */
    private final Map<String, String> savedByDigest = new HashMap<>();
    private int extracted;

    public InlineImages(Store store) {
        this.store = store;
    }

    /** Returns {@code text} with every decodable inline image replaced; undecodable ones are left untouched. */
    public String replaceAll(String text) throws Exception {
        if (text == null || !text.contains("data:image/")) return text;
        Matcher m = DATA_URL.matcher(text);
        StringBuilder out = new StringBuilder(text.length());
        while (m.find()) {
            String replacement = m.group();
            byte[] data = decode(m.group(2));
            if (data != null) {
                String key = digest(m.group(1), m.group(2));
                String url = savedByDigest.get(key);
                if (url == null) {
                    url = store.save(m.group(1), data);
                    savedByDigest.put(key, url);
                    extracted++;
                }
                replacement = url;
            }
            m.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        m.appendTail(out);
        return out.toString();
    }

    /** Number of distinct images handed to the store so far. */
    public int extractedCount() {
        return extracted;
    }

    private static byte[] decode(String base64) {
        try {
            byte[] data = Base64.getDecoder().decode(base64);
            return data.length == 0 ? null : data;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String digest(String contentType, String base64) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(contentType.getBytes(StandardCharsets.US_ASCII));
            md.update(base64.getBytes(StandardCharsets.US_ASCII));
            return HexFormat.of().formatHex(md.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
