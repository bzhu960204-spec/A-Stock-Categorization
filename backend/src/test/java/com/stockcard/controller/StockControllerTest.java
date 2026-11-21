package com.stockcard.controller;

import com.stockcard.entity.Stock;
import com.stockcard.service.StockService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;

import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(StockController.class)
class StockControllerTest {

    @Autowired MockMvc mvc;
    @MockBean StockService stockService;

    @Test
    void researchValueOutsideZeroToFiveIsRejected() throws Exception {
        mvc.perform(patch("/api/stocks/1/research-value").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"researchValue\":6}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/stocks/1/research-value").contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        verify(stockService, never()).updateResearchValue(anyLong(), anyInt());
    }

    @Test
    void oversizedJsonBodyIsRejectedWith413BeforeReachingTheController() throws Exception {
        String hugeNotes = "x".repeat(10 * 1024 * 1024 + 1);
        mvc.perform(post("/api/stocks").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"600519\",\"name\":\"MT\",\"notes\":\"" + hugeNotes + "\"}"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.message", containsString("请求内容过大")));

        verify(stockService, never()).create(any());
    }

    @Test
    void researchValueForUnknownStockIs404() throws Exception {
        when(stockService.updateResearchValue(eq(42L), eq(3))).thenReturn(Optional.empty());

        mvc.perform(patch("/api/stocks/42/research-value").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"researchValue\":3}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void documentWithBlankTitleOrContentIsRejected() throws Exception {
        mvc.perform(post("/api/stocks/1/documents").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"  \",\"content\":\"x\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/stocks/1/documents").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"t\"}"))
                .andExpect(status().isBadRequest());

        verify(stockService, never()).createDocument(anyLong(), any());
    }

    @Test
    void updatingUnknownStockIs404() throws Exception {
        when(stockService.update(eq(7L), any(Stock.class))).thenReturn(Optional.empty());

        mvc.perform(put("/api/stocks/7").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"1\",\"name\":\"n\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void createIgnoresServerManagedFields() throws Exception {
        when(stockService.create(any(Stock.class))).thenAnswer(inv -> inv.getArgument(0));

        mvc.perform(post("/api/stocks").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":99,\"code\":\" 600519 \",\"name\":\"茅台\",\"archived\":true," +
                                "\"categories\":[{\"id\":1}],\"market\":\"\"}"))
                .andExpect(status().isOk());

        ArgumentCaptor<Stock> captor = ArgumentCaptor.forClass(Stock.class);
        verify(stockService).create(captor.capture());
        Stock passed = captor.getValue();
        assertThat(passed.getId()).isNull();
        assertThat(passed.isArchived()).isFalse();
        assertThat(passed.getCategories()).isEmpty();
        assertThat(passed.getCode()).isEqualTo("600519");
        assertThat(passed.getMarket()).isNull(); // service applies the CN default
    }

    @Test
    void validationErrorsAreReportedWithFieldNames() throws Exception {
        mvc.perform(post("/api/stocks").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"\",\"name\":\"n\",\"researchValue\":9}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("code")))
                .andExpect(jsonPath("$.message").value(containsString("researchValue")));

        mvc.perform(post("/api/stocks/1/documents").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"" + "x".repeat(201) + "\",\"content\":\"c\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("title")));
    }

    @Test
    void malformedJsonIs400() throws Exception {
        mvc.perform(post("/api/stocks").contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("请求体格式错误"));
    }

    @Test
    void missingRequiredParameterReturnsJsonError() throws Exception {
        mvc.perform(get("/api/stocks/search"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").exists());
    }
}
