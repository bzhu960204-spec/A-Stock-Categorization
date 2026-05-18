package com.stockcard.controller;

import com.stockcard.entity.AppSetting;
import com.stockcard.repository.AppSettingRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/config")
public class ConfigController {

    private static final String KEY_TWELVEDATA = "twelvedata.api-key";

    private final AppSettingRepository settingRepo;

    @Value("${app.twelvedata.api-key:}")
    private String defaultTwelveDataApiKey;

    public ConfigController(AppSettingRepository settingRepo) {
        this.settingRepo = settingRepo;
    }

    /** GET /api/config  — returns current config (keys masked for display) */
    @GetMapping
    public ResponseEntity<Map<String, String>> getConfig() {
        String tdKey = resolveTwelveDataApiKey();
        String tdMasked = tdKey.isBlank() ? "" : tdKey.substring(0, Math.min(4, tdKey.length())) + "****";
        return ResponseEntity.ok(Map.of(
                "twelvedataApiKey", tdKey,
                "twelvedataApiKeyMasked", tdMasked
        ));
    }

    /** PUT /api/config  — saves config to DB */
    @PutMapping
    public ResponseEntity<Map<String, String>> saveConfig(@RequestBody Map<String, String> body) {
        if (body.containsKey("twelvedataApiKey")) {
            String newKey = body.getOrDefault("twelvedataApiKey", "").trim();
            settingRepo.save(new AppSetting(KEY_TWELVEDATA, newKey));
        }
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    /** Used by other controllers to read the effective Twelve Data API key */
    public String resolveTwelveDataApiKey() {
        return settingRepo.findById(KEY_TWELVEDATA)
                .map(AppSetting::getValue)
                .filter(v -> v != null && !v.isBlank())
                .orElse(defaultTwelveDataApiKey);
    }

    /** Alias for backward compat */
    public String resolveApiKey() {
        return resolveTwelveDataApiKey();
    }

}
