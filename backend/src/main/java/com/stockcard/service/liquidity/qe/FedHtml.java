package com.stockcard.service.liquidity.qe;

import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Pure helpers that pull the text, title and implementation-note link out of a federalreserve.gov press release (qe-radar §4.3). */
public final class FedHtml {

    private static final String SITE = "https://www.federalreserve.gov";
    private static final String TITLE_PREFIX = "Federal Reserve Board - ";
    private static final Pattern TITLE = Pattern.compile("(?is)<title[^>]*>(.*?)</title>");
    private static final Pattern SCRIPT_STYLE = Pattern.compile("(?is)<(script|style)\\b[^>]*>.*?</\\1\\s*>");
    private static final Pattern INLINE_TAG = Pattern.compile("(?is)</?(?:a|em|strong|span|b|i|u|sup|sub|font)\\b[^>]*>");
    private static final Pattern TAG = Pattern.compile("(?s)<[^>]*>");
    private static final Pattern NUMERIC_ENTITY = Pattern.compile("&#(?:x([0-9a-fA-F]+)|(\\d+));");
    private static final Pattern IMPL_NOTE_LINK = Pattern.compile(
            "href=\"(/newsevents/pressreleases/monetary\\d{8}a1\\.htm)\"[^>]*>\\s*Implementation Note");
    private static final String[] END_MARKERS = {"Last Update", "For media inquiries"};

    private FedHtml() {}

    /** Article text without markup, cut at "Last Update" / "For media inquiries"; empty when the page has no recognisable body. */
    public static String extractText(String html) {
        if (html == null) return "";
        int start = html.indexOf("id=\"article\"");
        if (start < 0) start = html.indexOf("id=\"content\"");
        if (start < 0) return "";
        int tagEnd = html.indexOf('>', start);
        if (tagEnd < 0) return "";

        String text = SCRIPT_STYLE.matcher(html.substring(tagEnd + 1)).replaceAll(" ");
        text = INLINE_TAG.matcher(text).replaceAll("");
        text = TAG.matcher(text).replaceAll(" ");
        text = collapseWhitespace(decodeEntities(text));

        int cut = text.length();
        for (String marker : END_MARKERS) {
            int i = text.indexOf(marker);
            if (i >= 0 && i < cut) cut = i;
        }
        return text.substring(0, cut).trim();
    }

    /** The page {@code <title>} without the "Federal Reserve Board - " prefix. */
    public static String extractTitle(String html) {
        if (html == null) return "";
        Matcher m = TITLE.matcher(html);
        if (!m.find()) return "";
        String title = collapseWhitespace(decodeEntities(m.group(1)));
        return title.startsWith(TITLE_PREFIX) ? title.substring(TITLE_PREFIX.length()).trim() : title;
    }

    /** The absolute URL of the statement's "Implementation Note" link, if it has one. */
    public static Optional<String> findImplementationNoteUrl(String html) {
        if (html == null) return Optional.empty();
        Matcher m = IMPL_NOTE_LINK.matcher(html);
        return m.find() ? Optional.of(SITE + m.group(1)) : Optional.empty();
    }

    static String decodeEntities(String text) {
        String s = text.replace("&nbsp;", " ").replace("&ndash;", "–").replace("&mdash;", "—")
                .replace("&rsquo;", "’").replace("&lsquo;", "‘").replace("&rdquo;", "”").replace("&ldquo;", "“")
                .replace("&quot;", "\"").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">");
        Matcher m = NUMERIC_ENTITY.matcher(s);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            int code = m.group(1) != null ? Integer.parseInt(m.group(1), 16) : Integer.parseInt(m.group(2));
            m.appendReplacement(out, Matcher.quoteReplacement(Character.isValidCodePoint(code) ? new String(Character.toChars(code)) : " "));
        }
        m.appendTail(out);
        // &amp; last, so that "&amp;lt;" decodes to "&lt;" rather than "<"
        return out.toString().replace("&amp;", "&");
    }

    private static String collapseWhitespace(String text) {
        return text.replace('\u00A0', ' ').replaceAll("\\s+", " ").trim();
    }
}
