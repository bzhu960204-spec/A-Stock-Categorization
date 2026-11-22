package com.stockcard.service.liquidity.qe;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FedHtmlTest {

    @Test
    void extractsTheStatementBodyAndCutsAtTheFooter() {
        String body = FedHtml.extractText(FedFixtures.text("fed-20261028a.html"));

        assertThat(body).startsWith("October 28, 2026").doesNotContain("<").doesNotContain("&nbsp;")
                .doesNotContain("For media inquiries").doesNotContain("Implementation Note");
        assertThat(body).contains("Voting against the monetary policy action");
    }

    @Test
    void implementationNotesOnlyHaveTheContentContainer() {
        String html = FedFixtures.text("fed-20261028a1.html");

        assertThat(html).doesNotContain("id=\"article\"").contains("id=\"content\"");
        assertThat(FedHtml.extractText(html)).contains("directs the Desk to").doesNotContain("Last Update");
    }

    @Test
    void anUnrecognisablePageHasNoText() {
        assertThat(FedHtml.extractText("<html><body><p>maintenance</p></body></html>")).isEmpty();
        assertThat(FedHtml.extractText(null)).isEmpty();
    }

    @Test
    void decodesNamedAndNumericEntitiesAndDropsScriptAndStyle() {
        String html = "<div id=\"article\"><script>var a = 1 < 2;</script><style>p{}</style><p>Fed &amp; Treasury&nbsp;&ndash; &#8217;s &#x2014; &quot;ok&quot;</p>"
                + "<p>Next.</p><p>Last Update: today</p></div>";

        assertThat(FedHtml.extractText(html)).isEqualTo("Fed & Treasury – ’s — \"ok\" Next.");
    }

    @Test
    void findsTheImplementationNoteLinkOfAStatementAndTheTitleWithoutPrefix() {
        String statement = FedFixtures.text("fed-20261028a.html");

        assertThat(FedHtml.findImplementationNoteUrl(statement))
                .contains("https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a1.htm");
        assertThat(FedHtml.extractTitle(statement)).isEqualTo("Federal Reserve issues FOMC statement");
        assertThat(FedHtml.findImplementationNoteUrl(FedFixtures.text("fed-20101103a.html"))).isEmpty();
    }

    @Test
    void parsesTheRssFeedFromBytesWithABomAndKeepsOnlyWhitelistedLinks() {
        byte[] withBom = FedFixtures.bytes("fed-rss.xml");
        // the recorded feed starts with a UTF-8 BOM, like the live one
        String xml = new String(withBom, StandardCharsets.UTF_8).replace(
                "</channel>", "<item><title>Other</title><link><![CDATA[https://evil.example/newsevents/pressreleases/monetary20260101a.htm]]></link></item></channel>");

        List<String> urls = FedTextClient.parseFeed(xml);

        assertThat(urls).isNotEmpty().allMatch(u -> u.startsWith(FedTextClient.ALLOWED_PREFIX));
        assertThat(urls).contains("https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm");
        assertThat(urls).noneMatch(u -> u.contains("evil.example"));
    }

    @Test
    void refusesFeedsThatDeclareADoctype() {
        String xxe = "<?xml version=\"1.0\"?><!DOCTYPE rss [<!ENTITY x SYSTEM \"file:///etc/passwd\">]><rss><channel/></rss>";

        assertThatThrownBy(() -> FedTextClient.parseFeed(xxe)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void theDocumentDateComesFromTheUrlAndTheTypeFromTheTitle() {
        assertThat(FedTextClient.dateOf("https://www.federalreserve.gov/newsevents/pressreleases/monetary20251210a1.htm"))
                .isEqualTo(LocalDate.of(2025, 12, 10));
        assertThat(FedDocType.fromTitle("Federal Reserve issues FOMC statement")).isEqualTo(FedDocType.STATEMENT);
        assertThat(FedDocType.fromTitle("Minutes of the Federal Open Market Committee, October 27-28, 2026")).isEqualTo(FedDocType.MINUTES);
        assertThat(FedDocType.fromTitle("Implementation Note issued October 28, 2026")).isEqualTo(FedDocType.IMPL_NOTE);
        assertThat(FedDocType.fromTitle("Federal Reserve announces revised schedule")).isEqualTo(FedDocType.OTHER);
    }
}
