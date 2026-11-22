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
        AppConfigService service = new AppConfigService(repo, " env-key ", "");
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
    void fredKeyIsStoredIndependentlyOfTheTwelveDataKey() {
        AppConfigService service = new AppConfigService(repo, "td-env", " fred-env ");
        assertThat(service.resolveFredApiKey()).isEqualTo("fred-env");
        assertThat(service.fredApiKeySource()).isEqualTo(AppConfigService.KeySource.ENVIRONMENT);

        service.saveFredApiKey(" fred-ui ");
        assertThat(service.resolveFredApiKey()).isEqualTo("fred-ui");
        assertThat(service.fredApiKeySource()).isEqualTo(AppConfigService.KeySource.DATABASE);
        assertThat(service.resolveTwelveDataApiKey()).isEqualTo("td-env");

        service.saveFredApiKey("");
        assertThat(service.resolveFredApiKey()).isEqualTo("fred-env");
    }

    @Test
    void noKeyAnywhereIsReportedAsNone() {
        AppConfigService service = new AppConfigService(repo, null, null);
        assertThat(service.resolveTwelveDataApiKey()).isEmpty();
        assertThat(service.twelveDataApiKeySource()).isEqualTo(AppConfigService.KeySource.NONE);
        assertThat(service.resolveFredApiKey()).isEmpty();
        assertThat(service.fredApiKeySource()).isEqualTo(AppConfigService.KeySource.NONE);
    }

    @Test
    void maskRevealsAtMostFourCharacters() {
        assertThat(AppConfigService.mask("abcdefgh")).isEqualTo("abcd****");
        assertThat(AppConfigService.mask("ab")).isEqualTo("ab****");
        assertThat(AppConfigService.mask("")).isEmpty();
        assertThat(AppConfigService.mask(null)).isEmpty();
    }
}
