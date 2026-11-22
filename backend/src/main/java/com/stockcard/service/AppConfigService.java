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
    private static final String KEY_FRED = "fred.api-key";

    private final AppSettingRepository settingRepo;
    private final String envTwelveDataApiKey;
    private final String envFredApiKey;

    public AppConfigService(AppSettingRepository settingRepo,
                            @Value("${app.twelvedata.api-key:}") String envTwelveDataApiKey,
                            @Value("${app.fred.api-key:}") String envFredApiKey) {
        this.settingRepo = settingRepo;
        this.envTwelveDataApiKey = envTwelveDataApiKey == null ? "" : envTwelveDataApiKey.trim();
        this.envFredApiKey = envFredApiKey == null ? "" : envFredApiKey.trim();
    }

    public String resolveTwelveDataApiKey() {
        return savedValue(KEY_TWELVEDATA).orElse(envTwelveDataApiKey);
    }

    public KeySource twelveDataApiKeySource() {
        return source(KEY_TWELVEDATA, envTwelveDataApiKey);
    }

    /** Saves a key entered in the UI; a blank value removes the saved key and falls back to the environment. */
    public void saveTwelveDataApiKey(String key) {
        save(KEY_TWELVEDATA, key);
    }

    public String resolveFredApiKey() {
        return savedValue(KEY_FRED).orElse(envFredApiKey);
    }

    public KeySource fredApiKeySource() {
        return source(KEY_FRED, envFredApiKey);
    }

    public void saveFredApiKey(String key) {
        save(KEY_FRED, key);
    }

    public static String mask(String secret) {
        if (secret == null || secret.isBlank()) return "";
        return secret.substring(0, Math.min(4, secret.length())) + "****";
    }

    private KeySource source(String settingKey, String envValue) {
        if (savedValue(settingKey).isPresent()) return KeySource.DATABASE;
        return envValue.isEmpty() ? KeySource.NONE : KeySource.ENVIRONMENT;
    }

    private void save(String settingKey, String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            settingRepo.deleteById(settingKey);
        } else {
            settingRepo.save(new AppSetting(settingKey, trimmed));
        }
    }

    private Optional<String> savedValue(String settingKey) {
        return settingRepo.findById(settingKey)
                .map(AppSetting::getValue)
                .filter(v -> !v.isBlank());
    }
}
