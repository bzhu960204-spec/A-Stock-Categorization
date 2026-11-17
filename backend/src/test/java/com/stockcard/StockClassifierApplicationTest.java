package com.stockcard;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Boots the full application against a throwaway in-memory DB (never touches ./data). */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:context-test;DB_CLOSE_DELAY=-1",
        "app.backup.enabled=false",
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
    void corsIsNotRegisteredOutsideDevProfile() throws Exception {
        mvc.perform(get("/api/stocks").header("Origin", "http://evil.example"))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
