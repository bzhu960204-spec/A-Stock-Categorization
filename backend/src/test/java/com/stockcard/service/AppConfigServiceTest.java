package com.stockcard.service;

import com.stockcard.repository.AppSettingRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class AppConfigServiceTest {

    @Autowired AppSettingRepository repo;

    @Test
    void savedKeyOverridesEnvironmentAndClearingFallsBack() {
        AppConfigService service = new AppConfigService(repo, " env-key ");
        assertThat(service.resolveTwelveDataApiKey()).isEqualTo("env-key");
        assertThat(service.twelveDataApiKeySource()).isEqualTo(AppConfigService.KeySource.ENVIRONMENT);

        service.saveTwelveDataApiKey("  ui-key ");
        assertThat(service.resolveTwelveDataApiKey()).isEqualTo("ui-key");
        assertThat(service.twelveDataApiKeySource()).isEqualTo(AppConfigService.KeySource.DATABASE);

        service.saveTwelveDataApiKey("");
        assertThat(service.resolveTwelveDataApiKey()).isEqualTo("env-key");
        service.saveTwelveDataApiKey(null); // clearing twice is a no-op
        assertThat(service.twelveDataApiKeySource()).isEqualTo(AppConfigService.KeySource.ENVIRONMENT);
    }

    @Test
    void noKeyAnywhereIsReportedAsNone() {
        AppConfigService service = new AppConfigService(repo, null);
        assertThat(service.resolveTwelveDataApiKey()).isEmpty();
        assertThat(service.twelveDataApiKeySource()).isEqualTo(AppConfigService.KeySource.NONE);
    }

    @Test
    void maskRevealsAtMostFourCharacters() {
        assertThat(AppConfigService.mask("abcdefgh")).isEqualTo("abcd****");
        assertThat(AppConfigService.mask("ab")).isEqualTo("ab****");
        assertThat(AppConfigService.mask("")).isEmpty();
        assertThat(AppConfigService.mask(null)).isEmpty();
    }
}
