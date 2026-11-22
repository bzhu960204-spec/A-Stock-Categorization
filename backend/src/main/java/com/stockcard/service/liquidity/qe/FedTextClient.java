package com.stockcard.service.liquidity.qe;

import com.stockcard.service.liquidity.LiquidityHttp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fetches Fed press releases (qe-radar §4.3): the monetary-policy RSS feed (about the last 15 items), the implementation note linked
 * from each FOMC statement and, for the first run, a fixed list of historical QE-era pages. Fetching only; classification is elsewhere.
 */
@Component
public class FedTextClient {

    private static final Logger log = LoggerFactory.getLogger(FedTextClient.class);

    static final String FEED_URL = "https://www.federalreserve.gov/feeds/press_monetary.xml";
    /** Anything else a feed item links to is dropped (SSRF guard). */
    static final String ALLOWED_PREFIX = "https://www.federalreserve.gov/newsevents/pressreleases/";
    private static final Pattern URL_DATE = Pattern.compile("monetary(\\d{8})");
    private static final DateTimeFormatter COMPACT_DATE = DateTimeFormatter.BASIC_ISO_DATE;
    private static final long REQUEST_GAP_MS = 1000;

    /** QE-era statements and implementation notes used to back-fill an empty table (qe-radar appendix C). */
    static final List<String> HISTORY_URLS = List.of(
            "20081125b", "20090318a", "20101103a", "20120913a", "20121212a", "20131218a", "20141029a", "20170920a",
            "20190731a", "20191011a", "20200315a", "20200323a", "20230312a", "20251029a", "20251210a", "20251210a1")
            .stream().map(id -> ALLOWED_PREFIX + "monetary" + id + ".htm").toList();

    private final LiquidityHttp http;
    private final long requestGapMs;

    @Autowired
    public FedTextClient(LiquidityHttp http) {
        this(http, REQUEST_GAP_MS);
    }

    FedTextClient(LiquidityHttp http, long requestGapMs) {
        this.http = http;
        this.requestGapMs = requestGapMs;
    }

    /** Pages that are not in {@code knownUrls} yet, one request at a time with a pause between requests. */
    public List<FedDocument> fetch(Set<String> knownUrls, boolean includeHistory) {
        Deque<String> pending = new ArrayDeque<>();
        Set<String> seen = new HashSet<>(knownUrls);
        List<String> candidates = new ArrayList<>(parseFeed(http.getText(URI.create(FEED_URL))));
        if (includeHistory) candidates.addAll(HISTORY_URLS);
        for (String url : candidates) {
            if (seen.add(url)) pending.add(url);
        }

        List<FedDocument> docs = new ArrayList<>();
        boolean first = true;
        while (!pending.isEmpty()) {
            String url = pending.poll();
            if (!first) pause();
            first = false;
            String html;
            try {
                html = http.getText(URI.create(url));
            } catch (RuntimeException e) {
                log.warn("Could not fetch Fed page {}: {}", url, e.getMessage());
                docs.add(new FedDocument(url, dateOf(url), "", FedDocType.OTHER, ""));
                continue;
            }
            String title = FedHtml.extractTitle(html);
            FedDocType type = FedDocType.fromTitle(title);
            docs.add(new FedDocument(url, dateOf(url), title, type, FedHtml.extractText(html)));
            if (type == FedDocType.STATEMENT) {
                Optional<String> note = FedHtml.findImplementationNoteUrl(html).filter(FedTextClient::isAllowed);
                note.filter(seen::add).ifPresent(pending::add);
            }
        }
        return docs;
    }

    /** The whitelisted page URLs of an RSS feed, newest first as listed; the date is taken from the URL, not from pubDate. */
    static List<String> parseFeed(String xml) {
        String text = xml.startsWith("\uFEFF") ? xml.substring(1) : xml;
        List<String> urls = new ArrayList<>();
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            Document doc = factory.newDocumentBuilder().parse(new InputSource(new StringReader(text)));
            NodeList items = doc.getElementsByTagName("item");
            for (int i = 0; i < items.getLength(); i++) {
                NodeList links = ((Element) items.item(i)).getElementsByTagName("link");
                if (links.getLength() == 0) continue;
                String url = links.item(0).getTextContent().trim();
                if (isAllowed(url)) urls.add(url);
            }
        } catch (Exception e) {
            throw new IllegalStateException("无法解析美联储 RSS: " + e.getMessage(), e);
        }
        return urls;
    }

    static boolean isAllowed(String url) {
        return url != null && url.startsWith(ALLOWED_PREFIX) && URL_DATE.matcher(url).find();
    }

    static LocalDate dateOf(String url) {
        Matcher m = URL_DATE.matcher(url);
        if (!m.find()) throw new IllegalArgumentException("URL 中没有日期: " + url);
        return LocalDate.parse(m.group(1), COMPACT_DATE);
    }

    private void pause() {
        if (requestGapMs <= 0) return;
        try {
            Thread.sleep(requestGapMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while fetching Fed pages");
        }
    }
}
