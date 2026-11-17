package com.stockcard.service;

import com.stockcard.entity.AppSetting;
import com.stockcard.repository.AppSettingRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Optional;

/** Resolves runtime settings: a value saved in the DB (via the UI) wins over the environment default. */
@Service
public class AppConfigService {

    public enum KeySource { DATABASE, ENVIRONMENT, NONE }

    private static final String KEY_TWELVEDATA = "twelvedata.api-key";

    private final AppSettingRepository settingRepo;
    private final String envTwelveDataApiKey;

    public AppConfigService(AppSettingRepository settingRepo,
                            @Value("${app.twelvedata.api-key:}") String envTwelveDataApiKey) {
        this.settingRepo = settingRepo;
        this.envTwelveDataApiKey = envTwelveDataApiKey == null ? "" : envTwelveDataApiKey.trim();
    }

    public String resolveTwelveDataApiKey() {
        return savedTwelveDataApiKey().orElse(envTwelveDataApiKey);
    }

    public KeySource twelveDataApiKeySource() {
        if (savedTwelveDataApiKey().isPresent()) return KeySource.DATABASE;
        return envTwelveDataApiKey.isEmpty() ? KeySource.NONE : KeySource.ENVIRONMENT;
    }

    /** Saves a key entered in the UI; a blank value removes the saved key and falls back to the environment. */
    public void saveTwelveDataApiKey(String key) {
        String trimmed = key == null ? "" : key.trim();
        if (trimmed.isEmpty()) {
            settingRepo.deleteById(KEY_TWELVEDATA);
        } else {
            settingRepo.save(new AppSetting(KEY_TWELVEDATA, trimmed));
        }
    }

    public static String mask(String secret) {
        if (secret == null || secret.isBlank()) return "";
        return secret.substring(0, Math.min(4, secret.length())) + "****";
    }

    private Optional<String> savedTwelveDataApiKey() {
        return settingRepo.findById(KEY_TWELVEDATA)
                .map(AppSetting::getValue)
                .filter(v -> !v.isBlank());
    }
}
