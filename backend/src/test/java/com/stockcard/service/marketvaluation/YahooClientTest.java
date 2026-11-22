package com.stockcard.service.marketvaluation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class YahooClientTest {

    @Test
    void timestampsBecomeExchangeLocalDates() {
        List<MvPoint> points = YahooClient.parse(MvFixtures.json("yahoo-chart-gspc.json"), false);

        assertThat(points).hasSize(5);
        assertThat(points.get(0).date()).isEqualTo(LocalDate.of(2026, 11, 16));
        assertThat(points.get(4).date()).isEqualTo(LocalDate.of(2026, 11, 20));
        assertThat(points.get(3).value()).isEqualTo(7175.830078125);
        assertThat(points.get(4).value()).isEqualTo(6910.39013671875);
    }

    @Test
    void nullClosesAreSkipped() {
        JsonNode root = MvFixtures.json("yahoo-chart-gspc.json");
        ((ArrayNode) root.at("/chart/result/0/indicators/quote/0/close")).set(2, com.fasterxml.jackson.databind.node.NullNode.getInstance());

        List<MvPoint> points = YahooClient.parse(root, false);

        assertThat(points).hasSize(4);
        assertThat(points).extracting(MvPoint::date).doesNotContain(LocalDate.of(2026, 11, 18));
    }

    @Test
    void adjustedSeriesReadsAdjclose() {
        JsonNode root = MvFixtures.json("yahoo-chart-gspc.json");
        ((ArrayNode) root.at("/chart/result/0/indicators/adjclose/0/adjclose")).set(4, com.fasterxml.jackson.databind.node.DoubleNode.valueOf(123.0));

        assertThat(YahooClient.parse(root, true).get(4).value()).isEqualTo(123.0);
        assertThat(YahooClient.parse(root, false).get(4).value()).isEqualTo(6910.39013671875);
    }

    @Test
    void anErrorObjectIsAnException() throws Exception {
        JsonNode root = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree("{\"chart\":{\"result\":null,\"error\":{\"code\":\"Not Found\",\"description\":\"No data found\"}}}");
        assertThatThrownBy(() -> YahooClient.parse(root, false)).hasMessageContaining("No data found");
    }

    @Test
    void windowIsRequestedWithPeriodParametersAndEncodedCaret() {
        String uri = YahooClient.uri("^GSPC", LocalDate.of(1990, 1, 1), LocalDate.of(2026, 11, 22)).toString();

        assertThat(uri).contains("/chart/%5EGSPC?period1=631152000&period2=").contains("interval=1d").doesNotContain("range=max");
    }
}
