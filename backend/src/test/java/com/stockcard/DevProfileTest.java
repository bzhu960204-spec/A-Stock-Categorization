package com.stockcard;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:dev-profile-test;DB_CLOSE_DELAY=-1",
        "app.backup.enabled=false"
})
@ActiveProfiles("dev")
@AutoConfigureMockMvc
class DevProfileTest {

    @Autowired MockMvc mvc;

    @Test
    void corsAllowsLocalOriginsOnly() throws Exception {
        mvc.perform(get("/api/stocks").header("Origin", "http://localhost:5174"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5174"));
        mvc.perform(get("/api/stocks").header("Origin", "http://evil.example"))
                .andExpect(status().isForbidden());
    }
}
