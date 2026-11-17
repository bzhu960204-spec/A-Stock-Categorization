package com.stockcard.controller;

import com.stockcard.service.AppConfigService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ConfigController.class)
class ConfigControllerTest {

    private static final String SECRET = "abcd1234-super-secret";

    @Autowired MockMvc mvc;
    @MockBean AppConfigService appConfigService;

    @Test
    void getNeverReturnsThePlainTextKey() throws Exception {
        when(appConfigService.resolveTwelveDataApiKey()).thenReturn(SECRET);
        when(appConfigService.twelveDataApiKeySource()).thenReturn(AppConfigService.KeySource.ENVIRONMENT);

        mvc.perform(get("/api/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.twelvedataApiKeyConfigured").value(true))
                .andExpect(jsonPath("$.twelvedataApiKeyMasked").value("abcd****"))
                .andExpect(jsonPath("$.twelvedataApiKeySource").value("ENVIRONMENT"))
                .andExpect(content().string(not(containsString(SECRET))));
    }

    @Test
    void putSavesProvidedKey() throws Exception {
        mvc.perform(put("/api/config").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"twelvedataApiKey\":\"new-key\"}"))
                .andExpect(status().isOk());

        verify(appConfigService).saveTwelveDataApiKey("new-key");
    }
}
