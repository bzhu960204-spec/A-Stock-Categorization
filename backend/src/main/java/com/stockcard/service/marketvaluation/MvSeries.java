package com.stockcard.service.marketvaluation;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Catalog of the fixed built-in series: raw ones are stored (design §3.1), derived ones are computed on read (§3.2). WPE_* are generated, see {@link MvCatalog}. */
public enum MvSeries {

    // ---- raw: multpl.com ----
    SPX_CAPE("席勒 CAPE", "x", Frequency.MONTHLY, MvSource.MULTPL, Group.VALUATION, Direction.HIGHER_IS_EXPENSIVE, 45, false, "multpl 月度（月初约定），1871 起"),
    SPX_CAPE_SPOT("CAPE 现值（multpl 估算）", "x", Frequency.DAILY, MvSource.MULTPL, Group.VALUATION, Direction.NONE, 5, true, "multpl 每日现值，自上线起逐日积累"),
    SPX_PE("TTM PE（multpl）", "x", Frequency.MONTHLY, MvSource.MULTPL, Group.VALUATION, Direction.HIGHER_IS_EXPENSIVE, 45, false, "multpl 月度，1871 起"),
    SPX_PE_SPOT("TTM PE 现值（multpl 估算）", "x", Frequency.DAILY, MvSource.MULTPL, Group.VALUATION, Direction.NONE, 5, true, "multpl 每日现值，自上线起逐日积累"),
    SPX_DY("标普 500 股息率", "%", Frequency.MONTHLY, MvSource.MULTPL, Group.VALUATION, Direction.LOWER_IS_EXPENSIVE, 45, false, "multpl 月度（月末约定），1871 起"),
    SPX_DY_SPOT("股息率现值（multpl 估算）", "%", Frequency.DAILY, MvSource.MULTPL, Group.VALUATION, Direction.NONE, 5, true, "multpl 每日现值，自上线起逐日积累"),
    SPX_PB("市净率", "x", Frequency.QUARTERLY, MvSource.MULTPL, Group.VALUATION, Direction.HIGHER_IS_EXPENSIVE, 450, false, "multpl 季度，1999 起；回购使 PB 长期失真，不计入温度"),
    SPX_PB_SPOT("PB 现值（multpl 估算）", "x", Frequency.DAILY, MvSource.MULTPL, Group.VALUATION, Direction.NONE, 5, true, "multpl 每日现值，自上线起逐日积累"),
    SPX_PS("市销率", "x", Frequency.QUARTERLY, MvSource.MULTPL, Group.VALUATION, Direction.HIGHER_IS_EXPENSIVE, 450, false, "multpl 季度，2000 起"),
    SPX_PS_SPOT("PS 现值（multpl 估算）", "x", Frequency.DAILY, MvSource.MULTPL, Group.VALUATION, Direction.NONE, 5, true, "multpl 每日现值，自上线起逐日积累"),
    SPX_EPS("TTM 每股收益（报告口径）", "pt", Frequency.MONTHLY, MvSource.MULTPL, Group.PROFITABILITY, Direction.NONE, 180, false, "multpl 月末；滞后约 5 个月"),
    SPX_SPS("TTM 每股销售额", "pt", Frequency.QUARTERLY, MvSource.MULTPL, Group.PROFITABILITY, Direction.NONE, 430, false, "multpl 季度；滞后约 14 个月"),
    SPX_BVPS("每股净资产", "pt", Frequency.QUARTERLY, MvSource.MULTPL, Group.PROFITABILITY, Direction.NONE, 430, false, "multpl 季度；滞后约 14 个月"),

    // ---- raw: Yahoo Finance ----
    PX_SPX("标普 500", "pt", Frequency.DAILY, MvSource.YAHOO, Group.PRICE, Direction.NONE, 5, false, "Yahoo ^GSPC 收盘价"),
    PX_NDX("纳指 100", "pt", Frequency.DAILY, MvSource.YAHOO, Group.PRICE, Direction.NONE, 5, false, "Yahoo ^NDX 收盘价"),
    PX_DJI("道琼斯工业", "pt", Frequency.DAILY, MvSource.YAHOO, Group.PRICE, Direction.NONE, 5, false, "Yahoo ^DJI 收盘价"),
    PX_RUT("罗素 2000", "pt", Frequency.DAILY, MvSource.YAHOO, Group.PRICE, Direction.NONE, 5, false, "Yahoo ^RUT 收盘价"),
    PX_W5000("Wilshire 5000", "pt", Frequency.DAILY, MvSource.YAHOO, Group.PRICE, Direction.NONE, 5, false, "Yahoo ^W5000 收盘价"),
    VIX("VIX 波动率指数", "pt", Frequency.DAILY, MvSource.YAHOO, Group.STRUCTURE, Direction.NONE, 5, false, "Yahoo ^VIX 收盘价"),
    PX_SPY("SPY（复权）", "USD", Frequency.DAILY, MvSource.YAHOO, Group.PRICE, Direction.NONE, 5, false, "Yahoo SPY 复权收盘价"),
    PX_RSP("RSP 等权（复权）", "USD", Frequency.DAILY, MvSource.YAHOO, Group.PRICE, Direction.NONE, 5, false, "Yahoo RSP 复权收盘价"),

    // ---- raw: FRED ----
    GDP("名义 GDP（季调年化）", "bn", Frequency.QUARTERLY, MvSource.FRED, Group.MACRO, Direction.NONE, 130, false, "FRED GDP；日期为季初"),
    EQ_NONFIN("非金融企业股权市值", "bn", Frequency.QUARTERLY, MvSource.FRED, Group.MACRO, Direction.NONE, 130, false, "FRED NCBEILQ027S；日期改为季末"),
    EQ_FIN("国内金融部门股权市值", "bn", Frequency.QUARTERLY, MvSource.FRED, Group.MACRO, Direction.NONE, 130, false, "FRED FBCELLQ027S；日期改为季末"),
    NW_NONFIN("非金融企业净值（市值口径）", "bn", Frequency.QUARTERLY, MvSource.FRED, Group.MACRO, Direction.NONE, 130, false, "FRED TNWMVBSNNCB；日期改为季末"),
    CP_AFTER_TAX("企业税后利润", "bn", Frequency.QUARTERLY, MvSource.FRED, Group.MACRO, Direction.NONE, 130, false, "FRED CPATAX（含 IVA、CCAdj）；日期为季初"),
    UST10Y("10 年期国债收益率", "%", Frequency.DAILY, MvSource.FRED, Group.RELATIVE, Direction.NONE, 6, false, "FRED DGS10"),
    TIPS10Y("10 年期 TIPS 实际收益率", "%", Frequency.DAILY, MvSource.FRED, Group.RELATIVE, Direction.NONE, 6, false, "FRED DFII10；2003 起"),

    // ---- raw: FactSet Earnings Insight (weekly PDF) ----
    FS_FWD_PE("远期 12 个月 PE（FactSet）", "x", Frequency.WEEKLY, MvSource.FACTSET, Group.FACTSET, Direction.HIGHER_IS_EXPENSIVE, 10, false, "FactSet Earnings Insight，每周"),
    FS_FWD_PE_AVG5Y("远期 PE 5 年均值", "x", Frequency.WEEKLY, MvSource.FACTSET, Group.FACTSET, Direction.NONE, 10, false, "FactSet 报告引用的 5 年均值"),
    FS_FWD_PE_AVG10Y("远期 PE 10 年均值", "x", Frequency.WEEKLY, MvSource.FACTSET, Group.FACTSET, Direction.NONE, 10, false, "FactSet 报告引用的 10 年均值"),
    FS_TTM_PE("TTM PE（FactSet 口径）", "x", Frequency.WEEKLY, MvSource.FACTSET, Group.FACTSET, Direction.NONE, 10, false, "FactSet 报告中的 TTM PE"),
    FS_EPS_G_Q("当季混合 EPS 同比增速", "%", Frequency.WEEKLY, MvSource.FACTSET, Group.FACTSET, Direction.NONE, 10, false, "FactSet blended earnings growth；季度见周报簿记"),
    FS_REV_G_Q("当季混合营收同比增速", "%", Frequency.WEEKLY, MvSource.FACTSET, Group.FACTSET, Direction.NONE, 10, false, "FactSet blended revenue growth"),
    FS_BEAT_EPS("EPS 超预期公司占比", "%", Frequency.WEEKLY, MvSource.FACTSET, Group.FACTSET, Direction.NONE, 10, false, "FactSet earnings scorecard"),
    FS_EPS_G_NY("下一自然年 EPS 增速预期", "%", Frequency.WEEKLY, MvSource.FACTSET, Group.FACTSET, Direction.NONE, 10, false, "FactSet CY 预测（年份 = 报告年份 + 1）"),
    FS_REV_G_NY("下一自然年营收增速预期", "%", Frequency.WEEKLY, MvSource.FACTSET, Group.FACTSET, Direction.NONE, 10, false, "FactSet CY 预测（年份 = 报告年份 + 1）"),
    FS_TARGET("自下而上目标价", "pt", Frequency.WEEKLY, MvSource.FACTSET, Group.FACTSET, Direction.NONE, 10, false, "FactSet bottom-up target price"),
    FS_CLOSE("报告引用的收盘价", "pt", Frequency.WEEKLY, MvSource.FACTSET, Group.FACTSET, Direction.NONE, 10, false, "FactSet 报告引用的标普 500 收盘价"),

    // ---- derived: daily valuation extrapolated from monthly / quarterly fundamentals (§3.2.1) ----
    SPX_CAPE_D("CAPE（日度估算）", "x", Frequency.DAILY, null, Group.VALUATION, Direction.HIGHER_IS_EXPENSIVE, 5, true, "价格 ÷ 隐含基本面（锚点外推）", "SPX_CAPE", "SPX_CAPE_SPOT", "PX_SPX"),
    SPX_PE_D("TTM PE（日度估算）", "x", Frequency.DAILY, null, Group.VALUATION, Direction.HIGHER_IS_EXPENSIVE, 5, true, "价格 ÷ 隐含 TTM EPS（锚点外推）", "SPX_PE", "SPX_PE_SPOT", "PX_SPX"),
    SPX_PB_D("PB（日度估算）", "x", Frequency.DAILY, null, Group.VALUATION, Direction.HIGHER_IS_EXPENSIVE, 5, true, "价格 ÷ 隐含每股净资产（锚点外推）", "SPX_PB", "SPX_PB_SPOT", "PX_SPX"),
    SPX_PS_D("PS（日度估算）", "x", Frequency.DAILY, null, Group.VALUATION, Direction.HIGHER_IS_EXPENSIVE, 5, true, "价格 ÷ 隐含每股销售额（锚点外推）", "SPX_PS", "SPX_PS_SPOT", "PX_SPX"),
    SPX_DY_D("股息率（日度估算）", "%", Frequency.DAILY, null, Group.VALUATION, Direction.LOWER_IS_EXPENSIVE, 5, true, "隐含每股股息 ÷ 价格（锚点外推）", "SPX_DY", "SPX_DY_SPOT", "PX_SPX"),
    SPX_EY_D("盈利收益率（日度估算）", "%", Frequency.DAILY, null, Group.VALUATION, Direction.LOWER_IS_EXPENSIVE, 5, true, "100 ÷ TTM PE", "SPX_PE_D"),
    SPX_CAPE_EY_D("CAPE 收益率（日度估算）", "%", Frequency.DAILY, null, Group.VALUATION, Direction.LOWER_IS_EXPENSIVE, 5, true, "100 ÷ CAPE", "SPX_CAPE_D"),

    // ---- derived: Buffett indicator, Tobin's Q (§3.2.2) ----
    US_EQ_MV("美国企业股权总市值", "bn", Frequency.QUARTERLY, null, Group.MACRO, Direction.NONE, 130, false, "非金融 + 国内金融部门股权市值（Z.1）", "EQ_NONFIN", "EQ_FIN"),
    BUFFETT_Q("巴菲特指标（季度）", "%", Frequency.QUARTERLY, null, Group.VALUATION, Direction.HIGHER_IS_EXPENSIVE, 130, false, "股权总市值 ÷ 同季名义 GDP（官方口径）", "US_EQ_MV", "GDP"),
    BUFFETT_D("巴菲特指标（日度估算）", "%", Frequency.DAILY, null, Group.VALUATION, Direction.HIGHER_IS_EXPENSIVE, 5, true, "季末市值按 Wilshire 5000 外推 ÷ 最新 GDP", "US_EQ_MV", "GDP", "PX_W5000"),
    TOBIN_Q("托宾 Q（非金融企业）", "x", Frequency.QUARTERLY, null, Group.VALUATION, Direction.HIGHER_IS_EXPENSIVE, 130, false, "非金融企业股权市值 ÷ 净值；仅作参考", "EQ_NONFIN", "NW_NONFIN"),

    // ---- derived: relative valuation (§3.2.3) ----
    ERP_REAL_D("实际股权风险溢价", "%", Frequency.DAILY, null, Group.RELATIVE, Direction.LOWER_IS_EXPENSIVE, 6, true, "CAPE 收益率 − 10 年 TIPS 实际利率", "SPX_CAPE_EY_D", "TIPS10Y"),
    ERP_NOM_D("名义股权风险溢价", "%", Frequency.DAILY, null, Group.RELATIVE, Direction.LOWER_IS_EXPENSIVE, 6, true, "盈利收益率 − 10 年国债收益率（Fed 模型）", "SPX_EY_D", "UST10Y"),
    ERP_FWD("远期股权风险溢价", "%", Frequency.WEEKLY, null, Group.RELATIVE, Direction.LOWER_IS_EXPENSIVE, 10, false, "100 ÷ 远期 PE − 10 年国债收益率", "FS_FWD_PE", "UST10Y"),

    // ---- derived: profitability (§3.2.4) ----
    SPX_EPS_YOY("TTM EPS 同比", "%", Frequency.MONTHLY, null, Group.PROFITABILITY, Direction.NONE, 180, false, "与 12 个月前同一月末比较", "SPX_EPS"),
    SPX_NET_MARGIN("净利率", "%", Frequency.QUARTERLY, null, Group.PROFITABILITY, Direction.NONE, 430, false, "TTM EPS ÷ TTM 每股销售额", "SPX_EPS", "SPX_SPS"),
    SPX_ROE("ROE", "%", Frequency.QUARTERLY, null, Group.PROFITABILITY, Direction.NONE, 430, false, "TTM EPS ÷ 每股净资产（期末口径，回购使其偏高）", "SPX_EPS", "SPX_BVPS"),
    PROFIT_GDP("企业税后利润 / GDP", "%", Frequency.QUARTERLY, null, Group.PROFITABILITY, Direction.NONE, 130, false, "CPATAX ÷ GDP", "CP_AFTER_TAX", "GDP"),
    FS_FWD_EPS("远期 12 个月 EPS（隐含）", "pt", Frequency.WEEKLY, null, Group.PROFITABILITY, Direction.NONE, 10, false, "报告收盘价 ÷ 远期 PE；约 ±0.3% 取整误差", "FS_FWD_PE", "FS_CLOSE", "PX_SPX"),
    FS_FWD_EPS_CHG_4W("远期 EPS 4 周修正", "%", Frequency.WEEKLY, null, Group.PROFITABILITY, Direction.NONE, 10, false, "与 28 天前比较；幅度 < 0.6% 视为持平", "FS_FWD_EPS"),
    FS_FWD_EPS_CHG_13W("远期 EPS 13 周修正", "%", Frequency.WEEKLY, null, Group.PROFITABILITY, Direction.NONE, 10, false, "与 91 天前比较", "FS_FWD_EPS"),

    // ---- derived: structure (§3.2.5) ----
    RSP_SPY("等权 / 市值加权（RSP/SPY）", "x", Frequency.DAILY, null, Group.STRUCTURE, Direction.NONE, 5, false, "越低说明上涨越集中在头部", "PX_RSP", "PX_SPY");

    public enum Frequency { DAILY, WEEKLY, MONTHLY, QUARTERLY, EVENT }

    public enum Kind { RAW, DERIVED, MANUAL }

    public enum Group { VALUATION, RELATIVE, PROFITABILITY, STRUCTURE, PRICE, MACRO, FACTSET, MARKETS, MANUAL }

    public enum Direction { HIGHER_IS_EXPENSIVE, LOWER_IS_EXPENSIVE, NONE }

    private final String label;
    private final String unit;
    private final Frequency frequency;
    private final MvSource source;
    private final Group group;
    private final Direction direction;
    private final int typicalLagDays;
    private final boolean estimate;
    private final String description;
    private final List<String> dependencies;

    MvSeries(String label, String unit, Frequency frequency, MvSource source, Group group, Direction direction,
             int typicalLagDays, boolean estimate, String description, String... dependencies) {
        this.label = label;
        this.unit = unit;
        this.frequency = frequency;
        this.source = source;
        this.group = group;
        this.direction = direction;
        this.typicalLagDays = typicalLagDays;
        this.estimate = estimate;
        this.description = description;
        this.dependencies = List.of(dependencies);
    }

    private static final Map<String, MvSeries> BY_CODE = Arrays.stream(values())
            .collect(Collectors.toUnmodifiableMap(Enum::name, Function.identity()));

    public static Optional<MvSeries> find(String code) {
        return Optional.ofNullable(code == null ? null : BY_CODE.get(code));
    }

    public String code() { return name(); }
    public String label() { return label; }
    public String unit() { return unit; }
    public Frequency frequency() { return frequency; }
    public MvSource source() { return source; }
    public Group group() { return group; }
    public Direction direction() { return direction; }
    public int typicalLagDays() { return typicalLagDays; }
    public boolean estimate() { return estimate; }
    public String description() { return description; }
    public List<String> dependencies() { return dependencies; }

    public Kind kind() { return source == null ? Kind.DERIVED : Kind.RAW; }

    public boolean isDerived() { return source == null; }

    /** True when the series (or any of its inputs, transitively) comes from FRED and therefore needs the API key. */
    public boolean needsFred() {
        if (source == MvSource.FRED) return true;
        return dependencies.stream().anyMatch(d -> find(d).map(MvSeries::needsFred).orElse(false));
    }

    /** The raw series a source stores, in declaration order. */
    public static List<MvSeries> rawOf(MvSource source) {
        return Arrays.stream(values()).filter(s -> s.source == source).toList();
    }
}
