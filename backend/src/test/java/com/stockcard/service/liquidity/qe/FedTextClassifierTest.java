package com.stockcard.service.liquidity.qe;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class FedTextClassifierTest {

    static Stream<Arguments> expected() {
        return Stream.of(
                Arguments.of("20081125b", Set.of("QE_PURCHASE")),
                Arguments.of("20090318a", Set.of("QE_PURCHASE", "EMERGENCY")),
                Arguments.of("20101103a", Set.of("QE_PURCHASE")),
                Arguments.of("20120913a", Set.of("QE_PURCHASE")),
                Arguments.of("20121212a", Set.of("QE_PURCHASE")),
                Arguments.of("20131218a", Set.of("TAPER")),
                Arguments.of("20141029a", Set.of("TAPER")),
                Arguments.of("20170920a", Set.of("QT")),
                Arguments.of("20190731a", Set.of("QT_END", "CUT")),
                Arguments.of("20191011a", Set.of("RMP")),
                Arguments.of("20200315a", Set.of("QE_PURCHASE", "EMERGENCY", "CUT", "DISSENT_EASE")),
                Arguments.of("20200323a", Set.of("QE_PURCHASE", "EMERGENCY")),
                Arguments.of("20230312a", Set.of("EMERGENCY")),
                Arguments.of("20251029a", Set.of("QT_END", "CUT", "DISSENT_EASE", "DISSENT_TIGHTEN")), // Schmid "preferred no change" after a cut
                Arguments.of("20251210a", Set.of("RMP", "CUT", "DISSENT_EASE", "DISSENT_TIGHTEN")),
                Arguments.of("20251210a1", Set.of("RMP")),
                Arguments.of("20261028a", Set.of("DISSENT_TIGHTEN")),
                Arguments.of("20261028a1", Set.of("RMP")));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("expected")
    void classifiesTheRecordedPagesExactlyAsMeasured(String id, Set<String> categories) {
        FedTextClassifier.Result result = FedTextClassifier.classify(FedFixtures.body(id));

        assertThat(result.categories()).containsExactlyInAnyOrderElementsOf(categories);
    }

    @Test
    void buyingBillsIsNeverQe() {
        for (String id : List.of("20191011a", "20251210a", "20251210a1", "20261028a1")) {
            assertThat(FedTextClassifier.classify(FedFixtures.body(id)).categories()).doesNotContain("QE_PURCHASE");
        }
    }

    @Test
    void stanceIsTheSumOfTheCategoryWeightsAndEachCategoryCountsOnce() {
        // QE_PURCHASE +3, EMERGENCY +2, CUT +1, DISSENT_EASE +0.5
        assertThat(FedTextClassifier.classify(FedFixtures.body("20200315a")).stance()).isEqualTo(6.5);
        // RMP +2, CUT +1, DISSENT_EASE +0.5, DISSENT_TIGHTEN -0.5
        assertThat(FedTextClassifier.classify(FedFixtures.body("20251210a")).stance()).isEqualTo(3.0);
    }

    @Test
    void anExcludeWordRemovesTheSentenceFromACategory() {
        String reinvest = "The Committee will reinvest all principal payments and increase its holdings of Treasury securities.";
        assertThat(FedTextClassifier.classify(reinvest).categories()).doesNotContain("QE_PURCHASE");
        assertThat(FedTextClassifier.classify("The Committee will increase its holdings of Treasury securities.").categories())
                .containsExactly("QE_PURCHASE");
    }

    @Test
    void preferredNoChangeDissentsAgainstWhateverTheCommitteeDecided() {
        String afterCut = "The Committee decided to lower the target range for the federal funds rate. Voting against was A, who preferred no change.";
        String afterHike = "The Committee decided to raise the target range for the federal funds rate. Voting against was B, who preferred no change.";
        String unchanged = "The Committee decided to maintain the target range. Voting against was C, who preferred no change.";

        assertThat(FedTextClassifier.classify(afterCut).categories()).containsExactlyInAnyOrder("CUT", "DISSENT_TIGHTEN");
        assertThat(FedTextClassifier.classify(afterHike).categories()).containsExactlyInAnyOrder("HIKE", "DISSENT_EASE");
        assertThat(FedTextClassifier.classify(unchanged).categories()).isEmpty();
    }

    @Test
    void normalisesTypographicCharactersBeforeMatching() {
        String curly = "The Committee will increase the size of the Federal Reserve\u2019s balance sheet.";
        assertThat(FedTextClassifier.classify(curly).categories()).containsExactly("QE_PURCHASE");
    }

    @Test
    void splitsSentencesAfterAPeriodOrSemicolonBeforeACapital() {
        assertThat(FedTextClassifier.splitSentences("First one. Second one; Third \"quoted\". fourth stays.")).containsExactly(
                "First one.", "Second one;", "Third \"quoted\". fourth stays.");
    }

    @Test
    void aRateChangeAloneIsNotAnInstructionChange() {
        String previous = FedTextClassifier.extractDirective(FedFixtures.body("20251210a1"));
        String current = FedTextClassifier.extractDirective(FedFixtures.body("20261028a1"));

        assertThat(previous).isNotBlank().contains("Treasury bills");
        assertThat(current).isNotBlank().contains("Treasury bills");
        // the rate sentence changed from "3-1/2 to 3-3/4 percent" to "3-3/4 to 4 percent": not reported; "When appropriate," is
        FedTextClassifier.DirectiveChanges changes = FedTextClassifier.directiveChanges(previous, current);
        assertThat(changes.added()).hasSize(1).allMatch(s -> s.startsWith("When appropriate, increase"));
        assertThat(changes.removed()).hasSize(1).allMatch(s -> s.startsWith("Increase the System Open Market Account"));
    }

    @Test
    void reportsAddedAndRemovedInstructionSentences() {
        String before = "Conduct operations at a rate of 3.75 percent. Roll over all principal payments.";
        String after = "Conduct operations at a rate of 3.50 percent. Increase holdings through purchases of Treasury bills.";

        FedTextClassifier.DirectiveChanges changes = FedTextClassifier.directiveChanges(before, after);

        assertThat(changes.added()).containsExactly("Increase holdings through purchases of Treasury bills.");
        assertThat(changes.removed()).containsExactly("Roll over all principal payments.");
        assertThat(FedTextClassifier.directiveChanges(null, after)).isNull();
    }
}
