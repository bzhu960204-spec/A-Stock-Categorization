package com.stockcard;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Boots the full application against a throwaway in-memory DB (never touches ./data). */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:context-test;DB_CLOSE_DELAY=-1",
        "app.backup.enabled=false",
        "app.liquidity.enabled=false",
        "app.market-valuation.enabled=false",
        "app.fred.api-key=",
        "app.twelvedata.api-key=",
        "app.eastmoney.token="
})
@AutoConfigureMockMvc
class StockClassifierApplicationTest {

    @Autowired MockMvc mvc;

    @Test
    void contextLoadsAndCoreEndpointsRespond() throws Exception {
        mvc.perform(get("/api/stocks")).andExpect(status().isOk());
        mvc.perform(get("/api/categories")).andExpect(status().isOk());
        mvc.perform(get("/api/config")).andExpect(status().isOk());
    }

    @Test
    void h2ConsoleIsDisabledByDefault() throws Exception {
        mvc.perform(get("/h2-console/")).andExpect(status().isNotFound());
    }

    @Test
    void unknownPathsReturn404Json() throws Exception {
        mvc.perform(get("/api/does-not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.status").value(404));
    }

    @Test
    void invalidDateParameterIs400() throws Exception {
        mvc.perform(get("/api/earnings-calendar/notes").param("ticker", "AAPL").param("date", "2026-13-45"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/earnings-calendar/notes").param("ticker", "AAPL").param("date", "2026-01-30"))
                .andExpect(status().isOk());
    }

    @Test
    void duplicateCategoryNameIs409AndMissingNameIs400() throws Exception {
        String body = "{\"name\":\"重复分类\",\"color\":\"#fff\"}";
        mvc.perform(post("/api/categories").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        mvc.perform(post("/api/categories").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").exists());
        mvc.perform(post("/api/categories").contentType(MediaType.APPLICATION_JSON).content("{\"color\":\"#fff\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void valuationSnapshotRequiresCompanyNameAndDate() throws Exception {
        mvc.perform(post("/api/valuations/snapshots").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ticker\":\"AAPL\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("companyName")));
    }

    @Test
    void earningsNotesRoundTrip() throws Exception {
        mvc.perform(post("/api/earnings-calendar/notes").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ticker\":\"nvda\",\"date\":\"2026-02-25\",\"content\":\"note\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/earnings-calendar/notes").param("ticker", "NVDA").param("date", "2026-02-25"))
                .andExpect(jsonPath("$.content").value("note"));
    }

    @Test
    void liquidityEndpointsWorkEndToEndOnAnEmptyDatabase() throws Exception {
        mvc.perform(get("/api/liquidity/catalog")).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='SOFR_IORB')].kind").value("DERIVED"));
        mvc.perform(get("/api/liquidity/dashboard")).andExpect(status().isOk())
                .andExpect(jsonPath("$.overallStatus").value("NONE"))
                .andExpect(jsonPath("$.fredConfigured").value(false))
                .andExpect(jsonPath("$.cards.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(11)));
        mvc.perform(get("/api/liquidity/series").param("codes", "SOFR,SOFR_IORB,LIQ_RATIO,RMP_MONTHLY"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.SOFR").isArray());
        mvc.perform(get("/api/liquidity/series").param("codes", "NOPE")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/liquidity/scatter")).andExpect(status().isOk());
        mvc.perform(get("/api/liquidity/thresholds")).andExpect(status().isOk());
        mvc.perform(get("/api/liquidity/sync/status")).andExpect(status().isOk()).andExpect(jsonPath("$.running").value(false));
        mvc.perform(get("/api/liquidity/weekly").param("weekEnd", "2026-11-19")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/liquidity/weekly")).andExpect(status().isOk()).andExpect(jsonPath("$.rows").isArray());
    }

    @Test
    void liquidityManualSeriesRoundTripAndThresholdEditing() throws Exception {
        mvc.perform(post("/api/liquidity/manual-series").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"BAD\",\"name\":\"x\",\"unit\":\"bp\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/liquidity/manual-series").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"CDS_ORCL_5Y\",\"name\":\"甲骨文 5Y CDS\",\"unit\":\"bp\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/liquidity/manual-series").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"CDS_ORCL_5Y\",\"name\":\"dup\",\"unit\":\"bp\"}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/liquidity/manual-series/CDS_ORCL_5Y/observations").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"date\":\"2026-11-18\",\"value\":305},{\"date\":\"2026-11-19\",\"value\":257}]"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(2));
        mvc.perform(get("/api/liquidity/series").param("codes", "CDS_ORCL_5Y").param("from", "2026-11-01").param("to", "2026-11-30"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.CDS_ORCL_5Y[1][1]").value(257.0));
        mvc.perform(delete("/api/liquidity/manual-series/CDS_ORCL_5Y/observations/2026-11-18")).andExpect(status().isNoContent());
        mvc.perform(delete("/api/liquidity/manual-series/CDS_ORCL_5Y")).andExpect(status().isNoContent());
        mvc.perform(delete("/api/liquidity/manual-series/CDS_ORCL_5Y")).andExpect(status().isNotFound());

        mvc.perform(put("/api/liquidity/thresholds/SOFR_IORB").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"direction\":\"HIGHER_IS_WORSE\",\"yellow\":5,\"red\":0,\"enabled\":true}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/liquidity/thresholds/SOFR_IORB").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"direction\":\"HIGHER_IS_WORSE\",\"yellow\":-1,\"red\":1,\"enabled\":true}"))
                .andExpect(status().isOk());
        mvc.perform(delete("/api/liquidity/thresholds/SOFR_IORB")).andExpect(status().isNoContent());
    }

    @Test
    void marketValuationEndpointsWorkEndToEndOnAnEmptyDatabase() throws Exception {
        mvc.perform(get("/api/market-valuation/catalog")).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='SPX_CAPE_D')].kind").value("DERIVED"))
                .andExpect(jsonPath("$[?(@.code=='WPE_NDX_Z10Y')].kind").value("DERIVED"));
        mvc.perform(get("/api/market-valuation/dashboard")).andExpect(status().isOk())
                .andExpect(jsonPath("$.hasData").value(false))
                .andExpect(jsonPath("$.fredConfigured").value(false))
                .andExpect(jsonPath("$.cards.length()").value(12))
                .andExpect(jsonPath("$.temperature.value").doesNotExist())
                .andExpect(jsonPath("$.temperature.components.length()").value(5));
        mvc.perform(get("/api/market-valuation/dashboard").param("window", "bad")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/market-valuation/series").param("codes", "SPX_CAPE_D,BUFFETT_D,WPE_SPX_Z5Y").param("window", "20Y"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.series.SPX_CAPE_D").isArray());
        mvc.perform(get("/api/market-valuation/series").param("codes", "NOPE")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/market-valuation/markets")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(7));
        mvc.perform(get("/api/market-valuation/decomposition")).andExpect(status().isOk());
        mvc.perform(get("/api/market-valuation/scatter/pb-roe")).andExpect(status().isOk());
        mvc.perform(get("/api/market-valuation/sync/status")).andExpect(status().isOk()).andExpect(jsonPath("$.running").value(false));
        mvc.perform(get("/api/market-valuation/factset/reports")).andExpect(status().isOk()).andExpect(jsonPath("$.reports").isArray());
        mvc.perform(post("/api/market-valuation/sync").param("source", "MANUAL")).andExpect(status().isBadRequest());
    }

    @Test
    void marketValuationManualSeriesRoundTrip() throws Exception {
        mvc.perform(post("/api/market-valuation/manual-series").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"CDS_X\",\"name\":\"x\",\"unit\":\"%\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/market-valuation/manual-series").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"M_SPX_NET_MARGIN_FS\",\"name\":\"净利率（FactSet）\",\"unit\":\"%\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/market-valuation/manual-series").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"M_SPX_NET_MARGIN_FS\",\"name\":\"dup\",\"unit\":\"%\"}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/market-valuation/manual-series/M_SPX_NET_MARGIN_FS/observations").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"date\":\"2026-09-30\",\"value\":14.5},{\"date\":\"2026-10-31\",\"value\":14.9}]"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(2));
        mvc.perform(get("/api/market-valuation/series").param("codes", "M_SPX_NET_MARGIN_FS").param("from", "2026-01-01"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.series.M_SPX_NET_MARGIN_FS[1][1]").value(14.9));
        mvc.perform(delete("/api/market-valuation/manual-series/M_SPX_NET_MARGIN_FS/observations/2026-09-30")).andExpect(status().isNoContent());
        mvc.perform(delete("/api/market-valuation/manual-series/M_SPX_NET_MARGIN_FS")).andExpect(status().isNoContent());
        mvc.perform(delete("/api/market-valuation/manual-series/M_SPX_NET_MARGIN_FS")).andExpect(status().isNotFound());
    }

    @Test
    void marketEventsCanBeQueriedByDateRange() throws Exception {
        mvc.perform(get("/api/market-events/range").param("from", "2026-01-01").param("to", "2026-12-31"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/market-events/range").param("from", "2026-12-31").param("to", "2026-01-01"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void corsIsNotRegisteredOutsideDevProfile() throws Exception {
        mvc.perform(get("/api/stocks").header("Origin", "http://evil.example"))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
