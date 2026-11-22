package com.stockcard.service.liquidity;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.stockcard.entity.LiquidityObservation;
import com.stockcard.repository.LiquidityManualSeriesRepository;
import com.stockcard.repository.LiquidityObservationRepository;
import com.stockcard.repository.LiquidityThresholdRepository;
import com.stockcard.repository.LiquidityWeeklyReportRepository;
import com.stockcard.service.liquidity.LiquidityWeeklyService.WeeklyReport;
import com.stockcard.service.liquidity.LiquidityWeeklyService.WeeklyRow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
class LiquidityWeeklyServiceTest {

    private static final LocalDate WEEK_END = LocalDate.of(2026, 11, 20); // a Friday

    @Autowired LiquidityObservationRepository obsRepo;
    @Autowired LiquidityManualSeriesRepository manualRepo;
    @Autowired LiquidityThresholdRepository thresholdRepo;
    @Autowired LiquidityWeeklyReportRepository snapshotRepo;

    LiquidityWeeklyService weekly;
    LiquidityManualService manual;

    @BeforeEach
    void setUp() {
        LiquidityCalcService calc = new LiquidityCalcService(obsRepo, manualRepo);
        LiquidityThresholdService thresholds = new LiquidityThresholdService(thresholdRepo, manualRepo);
        manual = new LiquidityManualService(manualRepo, obsRepo, thresholdRepo);
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        weekly = new LiquidityWeeklyService(calc, thresholds, manual, snapshotRepo, mapper, null);

        seed("IORB", "2026-11-01", 3.90);
        // previous week (Nov 9-13): SOFR - IORB = -2, -1, -1, 0, 0 bp
        double[] prevSofr = {3.88, 3.89, 3.89, 3.90, 3.90};
        // this week (Nov 16-20), but Friday's rate is not published yet: +1, +2, 0, +1 bp
        double[] curSofr = {3.91, 3.92, 3.90, 3.91};
        for (int i = 0; i < prevSofr.length; i++) {
            seed("SOFR", LocalDate.of(2026, 11, 9).plusDays(i).toString(), prevSofr[i]);
        }
        for (int i = 0; i < curSofr.length; i++) {
            seed("SOFR", LocalDate.of(2026, 11, 16).plusDays(i).toString(), curSofr[i]);
        }
        for (int i = 0; i < 5; i++) seed("EFFR", LocalDate.of(2026, 11, 9).plusDays(i).toString(), 3.88);
        for (int i = 0; i < 4; i++) seed("EFFR", LocalDate.of(2026, 11, 16).plusDays(i).toString(), 3.88);

        seed("RESERVES", "2026-11-04", 2950);
        seed("RESERVES", "2026-11-11", 2965.4); // the Nov 18 value is not published yet
        seed("BANK_ASSETS", "2026-11-04", 27000);
        seed("BANK_ASSETS", "2026-11-11", 27000);
        seed("TGA", "2026-11-13", 800);
        seed("TGA", "2026-11-19", 852);
        seed("ONRRP_AMT", "2026-11-19", 0.4);
    }

    private void seed(String code, String date, double value) {
        LiquidityObservation o = new LiquidityObservation();
        o.setSeriesCode(code);
        o.setObsDate(LocalDate.parse(date));
        o.setObsValue(value);
        o.setSource("TEST");
        o.setFetchedAt(LocalDateTime.now());
        obsRepo.save(o);
    }

    private static WeeklyRow row(WeeklyReport report, String key) {
        return report.rows().stream().filter(r -> r.key().equals(key)).findFirst().orElseThrow();
    }

    @Test
    void aggregatesTheWeekWithAverageMaximumAndPositiveDays() {
        WeeklyReport report = weekly.report(WEEK_END);

        assertThat(report.weekStart()).isEqualTo(LocalDate.of(2026, 11, 16));
        assertThat(row(report, "SOFR_IORB_AVG").current()).isEqualTo(1.0);
        assertThat(row(report, "SOFR_IORB_AVG").previous()).isEqualTo(-0.8);
        assertThat(row(report, "SOFR_IORB_AVG").change()).isEqualTo(1.8);
        assertThat(row(report, "SOFR_IORB_MAX").current()).isEqualTo(2.0);
        assertThat(row(report, "SOFR_IORB_DAYS").current()).isEqualTo(3.0);
        assertThat(row(report, "SOFR_IORB_DAYS").previous()).isEqualTo(0.0);
        assertThat(row(report, "SOFR_EFFR_AVG").current()).isEqualTo(3.0);
        assertThat(row(report, "SOFR_EFFR_AVG").previous()).isEqualTo(1.2);
    }

    @Test
    void lastValueFallsBackToTheLastObservationOfTheWeekWhenFridayIsNotOutYet() {
        WeeklyReport report = weekly.report(WEEK_END);

        assertThat(row(report, "SOFR_LAST").current()).isEqualTo(3.91); // Thursday's rate
        assertThat(row(report, "SOFR_LAST").dataDate()).isEqualTo(LocalDate.of(2026, 11, 19));
        assertThat(row(report, "TGA_LAST").current()).isEqualTo(852.0);
        assertThat(row(report, "TGA_LAST").change()).isEqualTo(52.0);
    }

    @Test
    void reservesCarryTheLastValueForwardAndSayItWasNotUpdated() {
        WeeklyRow reserves = row(weekly.report(WEEK_END), "RESERVES");

        assertThat(reserves.current()).isEqualTo(2965.4);
        assertThat(reserves.previous()).isEqualTo(2950.0);
        assertThat(reserves.dataDate()).isEqualTo(LocalDate.of(2026, 11, 11));
        assertThat(reserves.note()).contains("未更新").contains("2026-11-11");
    }

    @Test
    void liquidityRatioShowsTheLatestAvailableValueAndItsDate() {
        WeeklyRow ratio = row(weekly.report(WEEK_END), "LIQ_RATIO");

        assertThat(ratio.current()).isEqualTo(10.982963); // 2965.4 / 27000, no RRP that week
        assertThat(ratio.dataDate()).isEqualTo(LocalDate.of(2026, 11, 11));
        assertThat(ratio.status()).isEqualTo(LiquidityStatus.RED); // below the 11% cliff
    }

    @Test
    void quietWeeksCountAsZeroButSeriesWithoutDataStayEmpty() {
        WeeklyReport report = weekly.report(WEEK_END);

        assertThat(row(report, "SRF_SUM").current()).isNull(); // never any SRF data
        seed("SRF_AMT", "2026-11-12", 0.0);
        WeeklyReport after = weekly.report(WEEK_END);
        assertThat(row(after, "SRF_SUM").current()).isEqualTo(0.0);
        assertThat(row(after, "SRF_MAX").current()).isNull(); // nothing observed this week
    }

    @Test
    void overallStatusAndObservationsFollowTheRules() {
        WeeklyReport report = weekly.report(WEEK_END);

        assertThat(report.overallStatus()).isEqualTo(LiquidityStatus.RED);
        assertThat(report.observations()).contains("SOFR 本周有 3 天高于 IORB，最高 +2.0bp。");
        assertThat(report.observations()).anyMatch(s -> s.startsWith("准备金比例 10.98%") && s.contains("已低于 11% 警戒线 0.02 个百分点"));
        assertThat(report.observations()).contains("ON RRP 已降至 4.0 亿美元，缓冲垫基本耗尽。");
        assertThat(report.observations()).contains("TGA 较上周增加 520 亿美元，抽走准备金。");
        assertThat(report.observations().size()).isBetween(3, 6);
    }

    @Test
    void manualSeriesAppearWithTheirLatestValueOfTheWeek() {
        manual.create("CDS_ORCL_5Y", "甲骨文 5Y CDS", "bp", null);
        manual.upsertObservations("CDS_ORCL_5Y", java.util.List.of(
                new SeriesPoint(LocalDate.of(2026, 11, 12), 292), new SeriesPoint(LocalDate.of(2026, 11, 18), 305),
                new SeriesPoint(LocalDate.of(2026, 11, 19), 257)));

        WeeklyRow cds = row(weekly.report(WEEK_END), "CDS_ORCL_5Y");

        assertThat(cds.current()).isEqualTo(257.0);
        assertThat(cds.previous()).isEqualTo(292.0);
        assertThat(cds.change()).isEqualTo(-35.0);
    }

    @Test
    void weekEndMustBeAFriday() {
        assertThatThrownBy(() -> weekly.report(LocalDate.of(2026, 11, 19))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theDefaultWeekIsTheLatestFinishedFriday() {
        ZoneId beijing = ZoneId.of("Asia/Shanghai");
        assertThat(LiquidityWeeklyService.lastFinishedFriday(ZonedDateTime.of(2026, 11, 22, 10, 0, 0, 0, beijing))).isEqualTo(WEEK_END); // Sunday
        assertThat(LiquidityWeeklyService.lastFinishedFriday(ZonedDateTime.of(2026, 11, 25, 10, 0, 0, 0, beijing))).isEqualTo(WEEK_END); // Wednesday
        assertThat(LiquidityWeeklyService.lastFinishedFriday(ZonedDateTime.of(2026, 11, 20, 22, 29, 0, 0, beijing))).isEqualTo(WEEK_END.minusWeeks(1));
        assertThat(LiquidityWeeklyService.lastFinishedFriday(ZonedDateTime.of(2026, 11, 20, 22, 30, 0, 0, beijing))).isEqualTo(WEEK_END);
    }

    @Test
    void snapshotsAreFrozenAndSavingTheSameWeekAgainReplacesThem() {
        LiquidityWeeklyService.SnapshotDetail first = weekly.saveSnapshot(WEEK_END, "第一版点评");
        seed("SOFR", "2026-11-20", 4.50); // data arriving later must not change the frozen payload

        assertThat(weekly.getSnapshot(first.id()).report().path("rows").toString()).isEqualTo(first.report().path("rows").toString());
        LiquidityWeeklyService.SnapshotDetail second = weekly.saveSnapshot(WEEK_END, "第二版点评");

        assertThat(second.id()).isEqualTo(first.id());
        assertThat(second.commentary()).isEqualTo("第二版点评");
        assertThat(weekly.listSnapshots()).hasSize(1);
        assertThat(weekly.listSnapshots().get(0).hasCommentary()).isTrue();

        weekly.updateCommentary(first.id(), "  ");
        assertThat(weekly.getSnapshot(first.id()).commentary()).isNull();
        assertThat(weekly.listSnapshots().get(0).hasCommentary()).isFalse();

        weekly.deleteSnapshot(first.id());
        assertThatThrownBy(() -> weekly.getSnapshot(first.id())).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void moneyFormatsInTheUnitsOfTheCourse() {
        assertThat(LiquidityWeeklyService.money(0.4)).isEqualTo("4.0 亿美元");
        assertThat(LiquidityWeeklyService.money(52)).isEqualTo("520 亿美元");
        assertThat(LiquidityWeeklyService.money(0.007)).isEqualTo("700 万美元");
        assertThat(LiquidityWeeklyService.money(2965.4)).isEqualTo("2.97 万亿美元");
    }
}
