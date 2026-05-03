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

    /** GET /api/config  — returns current config (key masked for display) */
    @GetMapping
    public ResponseEntity<Map<String, String>> getConfig() {
        String key = resolveApiKey();
        String masked = key.isBlank() ? "" : key.substring(0, Math.min(4, key.length())) + "****";
        return ResponseEntity.ok(Map.of(
                "twelvedataApiKey", key,
                "twelvedataApiKeyMasked", masked
        ));
    }

    /** PUT /api/config  — saves config to DB */
    @PutMapping
    public ResponseEntity<Map<String, String>> saveConfig(@RequestBody Map<String, String> body) {
        String newKey = body.getOrDefault("twelvedataApiKey", "").trim();
        settingRepo.save(new AppSetting(KEY_TWELVEDATA, newKey));
        return ResponseEntity.ok(Map.of("status", "ok", "twelvedataApiKey", newKey));
    }

    /** Used by other controllers to read the effective API key */
    public String resolveApiKey() {
        return settingRepo.findById(KEY_TWELVEDATA)
                .map(AppSetting::getValue)
                .filter(v -> v != null && !v.isBlank())
                .orElse(defaultTwelveDataApiKey);
    }
}
