package com.stockcard.controller;

import com.stockcard.service.AppConfigService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/config")
public class ConfigController {

    private final AppConfigService appConfigService;

    public ConfigController(AppConfigService appConfigService) {
        this.appConfigService = appConfigService;
    }

    /** GET /api/config — never returns secrets in plain text, only a masked preview and where the value comes from. */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getConfig() {
        String tdKey = appConfigService.resolveTwelveDataApiKey();
        return ResponseEntity.ok(Map.of(
                "twelvedataApiKeyConfigured", !tdKey.isBlank(),
                "twelvedataApiKeyMasked", AppConfigService.mask(tdKey),
                "twelvedataApiKeySource", appConfigService.twelveDataApiKeySource().name()
        ));
    }

    /** PUT /api/config — saves config to DB; an empty key clears the saved value (falls back to the environment). */
    @PutMapping
    public ResponseEntity<Map<String, String>> saveConfig(@RequestBody Map<String, String> body) {
        if (body.containsKey("twelvedataApiKey")) {
            appConfigService.saveTwelveDataApiKey(body.get("twelvedataApiKey"));
        }
        return ResponseEntity.ok(Map.of("status", "ok"));
    }
}
