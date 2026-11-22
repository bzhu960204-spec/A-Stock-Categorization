package com.stockcard.service.liquidity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockcard.service.AppConfigService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static com.stockcard.service.liquidity.Fixtures.json;
import static com.stockcard.service.liquidity.Fixtures.valueOn;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class FredClientTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void skipsMissingValuesAndConvertsMillionsToBillions() {
        double divisor = FredClient.unitDivisor(json("fred-series-millions.json"));
        List<SeriesPoint> points = FredClient.parseObservations(json("fred-observations.json"), divisor);

        assertThat(divisor).isEqualTo(1000.0);
        assertThat(points).hasSize(1); // the "." observation on 2026-11-19 is dropped
        assertThat(points.get(0).date()).isEqualTo(LocalDate.of(2026, 11, 12));
        assertThat(points.get(0).value()).isCloseTo(2965.4, within(1e-9));
    }

    @Test
    void billionsAndPercentSeriesAreKeptAsIs() throws Exception {
        JsonNode billions = MAPPER.readTree("{\"seriess\":[{\"units\":\"Billions of U.S. Dollars\"}]}");
        JsonNode percent = MAPPER.readTree("{\"seriess\":[{\"units\":\"Percent\"}]}");
        assertThat(FredClient.unitDivisor(billions)).isEqualTo(1.0);
        assertThat(FredClient.unitDivisor(percent)).isEqualTo(1.0);
        // the QE radar series: index levels and percentage points are not rescaled, only the H.4.1 balances in millions are
        assertThat(FredClient.unitDivisor(MAPPER.readTree("{\"seriess\":[{\"units\":\"Index\"}]}"))).isEqualTo(1.0);
        assertThat(FredClient.unitDivisor(MAPPER.readTree("{\"seriess\":[{\"units\":\"Percentage Points\"}]}"))).isEqualTo(1.0);
        assertThat(FredClient.unitDivisor(MAPPER.readTree("{\"seriess\":[{\"units\":\"Millions of U.S. Dollars\"}]}"))).isEqualTo(1000.0);
    }

    @Test
    void fetchWithoutAnApiKeyThrowsMissingApiKey() {
        AppConfigService config = mock(AppConfigService.class);
        when(config.resolveFredApiKey()).thenReturn("");
        FredClient client = new FredClient(mock(LiquidityHttp.class), config);

        assertThatThrownBy(() -> client.fetch(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 11, 22)))
                .isInstanceOf(MissingApiKeyException.class);
    }

    @Test
    void mergesIoerAndIorbIntoOneSeriesAndOnlyAsksForTheValidPeriods() throws Exception {
        AppConfigService config = mock(AppConfigService.class);
        when(config.resolveFredApiKey()).thenReturn("KEY123");
        LiquidityHttp http = mock(LiquidityHttp.class);
        when(http.getJson(any(URI.class))).thenAnswer(inv -> {
            String uri = inv.<URI>getArgument(0).toString();
            if (uri.contains("/series?")) {
                return MAPPER.readTree("{\"seriess\":[{\"units\":\"Percent\"}]}");
            }
            if (uri.contains("series_id=IOER")) return MAPPER.readTree(
                    "{\"observations\":[{\"date\":\"2021-07-28\",\"value\":\"0.15\"},{\"date\":\"2021-07-29\",\"value\":\"0.15\"}]}");
            if (uri.contains("series_id=IORB&")) return MAPPER.readTree(
                    "{\"observations\":[{\"date\":\"2021-07-29\",\"value\":\"0.15\"},{\"date\":\"2025-12-11\",\"value\":\"3.65\"}]}");
            return MAPPER.readTree("{\"observations\":[]}");
        });

        Map<String, List<SeriesPoint>> out = new FredClient(http, config).fetch(LocalDate.of(2018, 4, 1), LocalDate.of(2026, 11, 22));

        assertThat(out.get("IORB")).extracting(p -> p.date().toString())
                .containsExactly("2021-07-28", "2021-07-29", "2025-12-11");
        assertThat(valueOn(out, "IORB", "2025-12-11")).isEqualTo(3.65);
    }

    @Test
    void incrementalFetchNeverRequestsTheRetiredIoerSeries() {
        AppConfigService config = mock(AppConfigService.class);
        when(config.resolveFredApiKey()).thenReturn("KEY123");
        LiquidityHttp http = mock(LiquidityHttp.class);
        when(http.getJson(any(URI.class))).thenReturn(json("fred-series-millions.json"));

        new FredClient(http, config).fetch(LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 22));

        verify(http, never()).getJson(argThat((URI u) -> u.toString().contains("series_id=IOER")));
    }

    @Test
    void errorMessagesNeverContainTheApiKey() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("https://api.stlouisfed.org/fred/series?series_id=NOPE&api_key=SECRET99&file_type=json"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error_message\":\"Bad Request. The series does not exist. api_key=SECRET99\"}"));
        LiquidityHttp http = new LiquidityHttp(restTemplate, MAPPER, 0, 0);

        assertThatThrownBy(() -> http.getJson(URI.create("https://api.stlouisfed.org/fred/series?series_id=NOPE&api_key=SECRET99&file_type=json")))
                .hasMessageContaining("400")
                .hasMessageContaining("series does not exist")
                .hasMessageNotContaining("SECRET99");
    }

    @Test
    void retriesServerErrorsButNotClientErrors() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        String url = "https://markets.newyorkfed.org/api/rp/results/search.json?startDate=2026-01-01&endDate=2026-01-31";
        server.expect(requestTo(url)).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
        server.expect(requestTo(url)).andRespond(withSuccess("{\"ok\":true}", MediaType.APPLICATION_JSON));
        LiquidityHttp http = new LiquidityHttp(restTemplate, MAPPER, 2, 0);

        assertThat(http.getJson(URI.create(url)).path("ok").asBoolean()).isTrue();
        server.verify();

        MockRestServiceServer strict = MockRestServiceServer.bindTo(restTemplate).build();
        strict.expect(requestTo(url)).andRespond(withStatus(HttpStatus.BAD_REQUEST));
        assertThatThrownBy(() -> http.getJson(URI.create(url))).hasMessageContaining("400");
        strict.verify(); // exactly one request: a 400 is not retried
    }

    @Test
    void redactReplacesTheKeyValue() {
        assertThat(LiquidityHttp.redact("GET https://x/y?series_id=A&api_key=abc123&file_type=json"))
                .isEqualTo("GET https://x/y?series_id=A&api_key=***&file_type=json");
        assertThat(LiquidityHttp.redact(null)).isNull();
    }
}
