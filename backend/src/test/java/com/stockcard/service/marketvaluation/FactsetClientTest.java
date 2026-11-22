package com.stockcard.service.marketvaluation;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class FactsetClientTest {

    @Test
    void parsesEveryFieldOfTheLatestReport() {
        FactsetClient.FactsetParse p = FactsetClient.parseText(MvFixtures.text("factset-2026-11-20.txt"), LocalDate.of(2026, 11, 20));

        assertThat(p.ok()).isTrue();
        assertThat(p.values()).containsEntry("FS_FWD_PE", 17.1).containsEntry("FS_FWD_PE_AVG5Y", 19.8).containsEntry("FS_FWD_PE_AVG10Y", 19.1)
                .containsEntry("FS_TTM_PE", 22.9).containsEntry("FS_EPS_G_Q", 32.9).containsEntry("FS_REV_G_Q", 14.6)
                .containsEntry("FS_BEAT_EPS", 84.0).containsEntry("FS_EPS_G_NY", 16.4).containsEntry("FS_REV_G_NY", 10.0)
                .containsEntry("FS_TARGET", 9099.54).containsEntry("FS_CLOSE", 7175.83);
        assertThat(p.fiscalQuarter()).isEqualTo("Q3 2026");
        assertThat(p.targetUpsidePct()).isEqualTo(26.8);
        assertThat(p.missing()).isEmpty();
    }

    @Test
    void aDeclineThatIsAlreadyNegativeIsNotNegatedTwice() {
        FactsetClient.FactsetParse p = FactsetClient.parseText(MvFixtures.text("factset-2020-11-20.txt"), LocalDate.of(2020, 11, 20));

        assertThat(p.values()).containsEntry("FS_EPS_G_Q", -6.3).containsEntry("FS_FWD_PE", 21.7)
                .containsEntry("FS_FWD_PE_AVG5Y", 17.4).containsEntry("FS_FWD_PE_AVG10Y", 15.6).containsEntry("FS_BEAT_EPS", 84.0);
    }

    @Test
    void aPositiveNumberAfterTheWordDeclineMeansADrop() {
        String text = "For Q2 2020, the blended earnings decline for the S&P 500 is 31.8%. The forward 12-month P/E ratio for the S&P 500 is 20.1. "
                + "This P/E ratio is above the 5-year average (16.9) and above the 10-year average (15.2).";

        assertThat(FactsetClient.parseText(text, LocalDate.of(2020, 7, 24)).values()).containsEntry("FS_EPS_G_Q", -31.8);
    }

    @Test
    void anOldReportWithoutOptionalSentencesIsStillParsed() {
        FactsetClient.FactsetParse p = FactsetClient.parseText(MvFixtures.text("factset-2017-11-17.txt"), LocalDate.of(2017, 11, 17));

        assertThat(p.ok()).isTrue();
        assertThat(p.values()).containsEntry("FS_BEAT_EPS", 74.0).containsEntry("FS_EPS_G_Q", 6.2).containsEntry("FS_FWD_PE", 18.0)
                .containsEntry("FS_FWD_PE_AVG5Y", 15.7).containsEntry("FS_FWD_PE_AVG10Y", 14.1)
                .doesNotContainKeys("FS_EPS_G_NY", "FS_TARGET", "FS_CLOSE");
        assertThat(p.missing()).contains("FS_EPS_G_NY", "FS_TARGET");
    }

    @Test
    void onlyTheCalendarYearAfterTheReportYearIsTakenAsNextYearGrowth() {
        String text = "The forward 12-month P/E ratio for the S&P 500 is 17.1. This P/E ratio is below the 5-year average (19.8) and below the 10-year average (19.1). "
                + "For CY 2026, analysts are projecting earnings growth of 12.0% and revenue growth of 7.0%. "
                + "For CY 2027, analysts are projecting earnings growth of 16.4% and revenue growth of 10.0%.";

        assertThat(FactsetClient.parseText(text, LocalDate.of(2026, 11, 20)).values()).containsEntry("FS_EPS_G_NY", 16.4);
        assertThat(FactsetClient.parseText(text, LocalDate.of(2025, 11, 21)).values()).containsEntry("FS_EPS_G_NY", 12.0);
    }

    @Test
    void aTargetBelowTheCloseGivesANegativeUpside() {
        String text = "The forward 12-month P/E ratio for the S&P 500 is 17.1. This P/E ratio is below the 5-year average (19.8) and below the 10-year average (19.1). "
                + "The bottom-up target price for the S&P 500 is 6,500.00, which is 5.2% below the closing price of 6,856.00.";

        FactsetClient.FactsetParse p = FactsetClient.parseText(text, LocalDate.of(2026, 11, 20));

        assertThat(p.targetUpsidePct()).isEqualTo(-5.2);
        assertThat(p.values()).containsEntry("FS_TARGET", 6500.0).containsEntry("FS_CLOSE", 6856.0);
    }

    @Test
    void withoutTheForwardPeSentenceTheReportIsNotOk() {
        assertThat(FactsetClient.parseText("Earnings Insight: the layout was redesigned", LocalDate.of(2026, 11, 20)).ok()).isFalse();
    }

    @Test
    void specialBulletCharactersAndCurlyApostrophesAreNormalised() {
        String text = "\uF0B7 The forward\u00A012-month P/E ratio for the S&P 500 is 17.1. This P/E ratio is below the 5-year average (19.8)\n and below the 10-year average (19.1).";

        assertThat(FactsetClient.parseText(text, LocalDate.of(2026, 11, 20)).ok()).isTrue();
    }

    @Test
    void candidateFileNamesFollowFridayThenThursdayWithAndWithoutTheASuffix() {
        assertThat(FactsetClient.candidateFileNames(LocalDate.of(2026, 11, 20))).containsExactly(
                "EarningsInsight_112026.pdf", "EarningsInsight_112026A.pdf", "EarningsInsight_111926.pdf", "EarningsInsight_111926A.pdf");
        assertThat(FactsetClient.dateOf("EarningsInsight_111926A.pdf")).isEqualTo(LocalDate.of(2026, 11, 19));
    }

    @Test
    void fileUrlsPointAtTheEarningsInsightFolderWithTheNameExactlyOnce() {
        assertThat(FactsetClient.uriOf("EarningsInsight_112026A.pdf").toString()).isEqualTo(
                "https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_112026A.pdf");
    }

    @Test
    void fridaysAreListedNewestFirstStartingFromTheLastOneOnOrBeforeToday() {
        List<LocalDate> weeks = FactsetClient.fridaysBetween(LocalDate.of(2026, 10, 30), LocalDate.of(2026, 11, 22));

        assertThat(weeks).containsExactly(LocalDate.of(2026, 11, 20), LocalDate.of(2026, 11, 13), LocalDate.of(2026, 11, 6),
                LocalDate.of(2026, 10, 30));
    }

    @Test
    void textIsExtractedFromAPdf() throws Exception {
        byte[] pdf;
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(doc, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(50, 700);
                content.showText("The forward 12-month P/E ratio for the S&P 500 is 17.1.");
                content.endText();
            }
            doc.save(out);
            pdf = out.toByteArray();
        }

        assertThat(FactsetClient.extractText(pdf)).contains("forward 12-month P/E ratio for the S&P 500 is 17.1");
    }
}
