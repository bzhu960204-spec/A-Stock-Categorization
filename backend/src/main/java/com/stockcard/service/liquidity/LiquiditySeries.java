package com.stockcard.service.liquidity;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Catalog of the built-in series: raw ones are stored (design §3.1), derived ones are computed on read (§3.2). */
public enum LiquiditySeries {

    // ---- raw: NY Fed secured / unsecured rates ----
    SOFR("SOFR 有担保隔夜融资利率", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "NYFED rates，type=SOFR 的 percentRate"),
    SOFR_P1("SOFR 1 分位", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "SOFR 成交分布 1 分位"),
    SOFR_P25("SOFR 25 分位", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "SOFR 成交分布 25 分位"),
    SOFR_P75("SOFR 75 分位", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "SOFR 成交分布 75 分位"),
    SOFR_P99("SOFR 99 分位", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "SOFR 成交分布 99 分位（尾部压力）"),
    SOFR_VOL("SOFR 成交量", "bn", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "SOFR 日成交量（十亿美元）"),
    TGCR("TGCR 三方回购利率", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "Tri-party General Collateral Rate"),
    TGCR_P99("TGCR 99 分位", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "TGCR 成交分布 99 分位"),
    TGCR_VOL("TGCR 成交量", "bn", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "TGCR 日成交量（十亿美元）"),
    BGCR("BGCR 广义一般担保利率", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "Broad General Collateral Rate"),
    EFFR("EFFR 联邦基金有效利率", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "Effective Federal Funds Rate"),
    EFFR_VOL("EFFR 成交量", "bn", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "EFFR 日成交量（十亿美元）"),
    FFTR_LOW("联邦基金目标区间下限", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "取自 EFFR 记录的 targetRateFrom"),
    FFTR_HIGH("联邦基金目标区间上限", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "取自 EFFR 记录的 targetRateTo"),

    // ---- raw: NY Fed repo / reverse repo / Treasury purchases ----
    ONRRP_AMT("ON RRP 隔夜逆回购用量", "bn", Frequency.DAILY, LiquiditySource.NYFED, Group.STOCK, "同日 Reverse Repo 操作的 totalAmtAccepted 求和"),
    ONRRP_RATE("ON RRP 中标利率", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "利率走廊下沿"),
    SRF_AMT("SRF 常备回购用量", "bn", Frequency.DAILY, LiquiditySource.NYFED, Group.FACILITY, "同日 Repo 操作的 totalAmtAccepted 求和（2021-07 起即 SRF）"),
    SRF_RATE("SRF 最低报价利率", "%", Frequency.DAILY, LiquiditySource.NYFED, Group.RATE, "利率走廊上沿，2021-07-28 起有意义"),
    RMP_BILLS("美联储购买短期国债", "bn", Frequency.EVENT, LiquiditySource.NYFED, Group.FACILITY, "含储备管理购买（RMP）；仅在有操作的日期有值"),

    // ---- raw: Treasury / FRED ----
    TGA("TGA 财政部一般账户余额", "bn", Frequency.DAILY, LiquiditySource.TREASURY, Group.STOCK, "Treasury DTS，三段口径合并"),
    IORB("IORB 准备金利率", "%", Frequency.DAILY, LiquiditySource.FRED, Group.RATE, "2021-07-29 前为 IOER，合并为一条序列"),
    RESERVES("准备金余额（周均）", "bn", Frequency.WEEKLY, LiquiditySource.FRED, Group.STOCK, "FRED WRESBAL"),
    BANK_ASSETS("商业银行总资产", "bn", Frequency.WEEKLY, LiquiditySource.FRED, Group.STOCK, "FRED TLAACBW027SBOG（季调）"),
    FED_ASSETS("美联储总资产", "bn", Frequency.WEEKLY, LiquiditySource.FRED, Group.STOCK, "FRED WALCL"),
    HY_OAS("高收益债期权调整利差", "%", Frequency.DAILY, LiquiditySource.FRED, Group.CREDIT, "FRED BAMLH0A0HYM2"),

    // ---- raw: QE radar (qe-radar design §3.1) ----
    SOMA_TOTAL("SOMA 总持仓", "bn", Frequency.WEEKLY, LiquiditySource.NYFED, Group.BALANCE_SHEET, "NYFED soma：total"),
    SOMA_BILLS("SOMA 短期国债", "bn", Frequency.WEEKLY, LiquiditySource.NYFED, Group.BALANCE_SHEET, "NYFED soma：bills"),
    SOMA_COUPONS("SOMA 中长期国债", "bn", Frequency.WEEKLY, LiquiditySource.NYFED, Group.BALANCE_SHEET, "NYFED soma：notesbonds + tips + frn"),
    SOMA_MBS("SOMA 机构证券（MBS 等）", "bn", Frequency.WEEKLY, LiquiditySource.NYFED, Group.BALANCE_SHEET, "NYFED soma：mbs + cmbs + agencies"),
    COUPON_OPS_NET("中长期国债净购买操作", "bn", Frequency.EVENT, LiquiditySource.NYFED, Group.FACILITY,
            "Coupon / TIPS / FRN 的买入减卖出，按操作日合计；已忽略 0.5bn 以下的小额测试"),
    AGENCY_OPS_NET("MBS / 机构债净购买操作", "bn", Frequency.EVENT, LiquiditySource.NYFED, Group.FACILITY,
            "ambs Outright 买入减卖出 + 国债端点的 Agency Debt 购买；仅 2018 年起有 MBS 操作记录"),
    STLFSI4("圣路易斯联储金融压力指数", "idx", Frequency.WEEKLY, LiquiditySource.FRED, Group.PRESSURE, "FRED STLFSI4；0 = 历史平均"),
    NFCI("芝加哥联储金融条件指数", "idx", Frequency.WEEKLY, LiquiditySource.FRED, Group.PRESSURE, "FRED NFCI；越高越紧"),
    VIX("VIX 波动率指数", "idx", Frequency.DAILY, LiquiditySource.FRED, Group.PRESSURE, "FRED VIXCLS"),
    SAHM("萨姆规则衰退指标（实时）", "pp", Frequency.MONTHLY, LiquiditySource.FRED, Group.PRESSURE, "FRED SAHMREALTIME；≥ 0.5 历史上对应衰退开始"),
    UST2Y("2 年期国债收益率", "%", Frequency.DAILY, LiquiditySource.FRED, Group.POLICY, "FRED DGS2"),
    PRIMARY_CREDIT("贴现窗口一级信贷余额", "bn", Frequency.WEEKLY, LiquiditySource.FRED, Group.FACILITY, "FRED WLCFLPCL"),
    CB_SWAPS("央行流动性互换余额", "bn", Frequency.WEEKLY, LiquiditySource.FRED, Group.FACILITY, "FRED SWPT"),
    FED_REPO("H.4.1 回购协议余额", "bn", Frequency.WEEKLY, LiquiditySource.FRED, Group.FACILITY, "FRED WORAL"),

    // ---- derived ----
    SOFR_IORB("SOFR − IORB", "bp", Frequency.DAILY, Group.SPREAD,
            "核心警报：正常应为负（约 −2 ~ −5bp）；> 0 表示回购市场梗阻", "SOFR", "IORB"),
    TGCR_IORB("TGCR − IORB", "bp", Frequency.DAILY, Group.SPREAD,
            "高盛 Exhibit 5 的纵轴", "TGCR", "IORB"),
    SOFR_EFFR("SOFR − EFFR", "bp", Frequency.DAILY, Group.SPREAD,
            "有担保利率理应比无担保低约 2bp，持平即异常", "SOFR", "EFFR"),
    SOFR99_IORB("SOFR 99 分位 − IORB", "bp", Frequency.DAILY, Group.SPREAD,
            "尾部压力，通常比中位数更早报警", "SOFR_P99", "IORB"),
    EFFR_IORB("EFFR − IORB", "bp", Frequency.DAILY, Group.SPREAD,
            "准备金充裕度的辅助指标", "EFFR", "IORB"),
    SOFR_RRP("SOFR − 逆回购利率", "bp", Frequency.DAILY, Group.SPREAD,
            "SOFR 在利率走廊中的位置", "SOFR", "ONRRP_RATE"),
    RES_PLUS_RRP("准备金 + 逆回购", "bn", Frequency.WEEKLY, Group.STOCK,
            "RESERVES + 当周（周四至周三）ON RRP 均值", "RESERVES", "ONRRP_AMT"),
    LIQ_RATIO("(准备金 + 逆回购) / 银行总资产", "%", Frequency.WEEKLY, Group.STOCK,
            "高盛 Exhibit 5 的横轴（近似口径：周均准备金）；11% 为悬崖边缘", "RESERVES", "ONRRP_AMT", "BANK_ASSETS"),
    RMP_MONTHLY("月度短债购买额", "bn", Frequency.MONTHLY, Group.FACILITY,
            "按自然月对 RMP_BILLS 求和", "RMP_BILLS"),

    // ---- derived: QE radar (qe-radar design §3.2) ----
    SOMA_13W("SOMA 13 周变化", "bn", Frequency.WEEKLY, Group.BALANCE_SHEET,
            "SOMA 总持仓较 91 天前的变化；≥ 25bn 即技术性扩表（L2）门槛", "SOMA_TOTAL"),
    SOMA_BILLS_13W("短债持仓 13 周变化", "bn", Frequency.WEEKLY, Group.BALANCE_SHEET,
            "SOMA 短期国债较 91 天前的变化", "SOMA_BILLS"),
    SOMA_LONG_13W("长债 + MBS 13 周变化", "bn", Frequency.WEEKLY, Group.BALANCE_SHEET,
            "SOMA 中长期国债与 MBS 合计较 91 天前的变化；QE（L4）的持仓确认", "SOMA_COUPONS", "SOMA_MBS"),
    QE_OPS_28D("近 28 天长债 + MBS 净购买", "bn", Frequency.DAILY, Group.FACILITY,
            "COUPON_OPS_NET 与 AGENCY_OPS_NET 的 28 天滚动合计，按工作日产出", "COUPON_OPS_NET", "AGENCY_OPS_NET"),
    NONSEC_ASSETS("联储非证券资产", "bn", Frequency.WEEKLY, Group.BALANCE_SHEET,
            "美联储总资产 − SOMA 总持仓（贷款、回购、互换、紧急工具，含未摊销溢价等慢变量）", "FED_ASSETS", "SOMA_TOTAL"),
    NONSEC_4W("非证券资产 4 周变化", "bn", Frequency.WEEKLY, Group.BALANCE_SHEET,
            "兜底捕捉 2020 年各类临时工具、2023 年 BTFP 等不在单独序列里的救助", "FED_ASSETS", "SOMA_TOTAL"),
    PRIMARY_CREDIT_4W("贴现窗口 4 周变化", "bn", Frequency.WEEKLY, Group.FACILITY,
            "一级信贷余额较 28 天前的变化", "PRIMARY_CREDIT"),
    CB_SWAPS_4W("央行互换 4 周变化", "bn", Frequency.WEEKLY, Group.FACILITY,
            "央行流动性互换余额较 28 天前的变化", "CB_SWAPS"),
    NET_LIQ("净流动性", "bn", Frequency.WEEKLY, Group.BALANCE_SHEET,
            "美联储总资产 − TGA − ON RRP；TGA 下降带来的增加是财政放水，不是 QE", "FED_ASSETS", "TGA", "ONRRP_AMT"),
    NET_LIQ_4W("净流动性 4 周变化", "bn", Frequency.WEEKLY, Group.BALANCE_SHEET,
            "净流动性较 28 天前的变化", "FED_ASSETS", "TGA", "ONRRP_AMT"),
    NET_LIQ_13W("净流动性 13 周变化", "bn", Frequency.WEEKLY, Group.BALANCE_SHEET,
            "净流动性较 91 天前的变化（仅展示，不参与判定）", "FED_ASSETS", "TGA", "ONRRP_AMT"),
    CUT_PRICING("市场降息定价", "bp", Frequency.DAILY, Group.POLICY,
            "(2 年期国债收益率 − EFFR) × 100；越低表示市场越预期降息", "UST2Y", "EFFR"),
    RATE_CHANGE_6M("政策利率半年变化", "bp", Frequency.DAILY, Group.POLICY,
            "联邦基金目标区间上限较 182 天前的变化 × 100", "FFTR_HIGH");

    public enum Kind { RAW, DERIVED, MANUAL }

    public enum Frequency { DAILY, WEEKLY, MONTHLY, EVENT }

    /** Display groups used by the catalog. */
    public enum Group { RATE, SPREAD, STOCK, FACILITY, CREDIT, MANUAL, PRESSURE, POLICY, BALANCE_SHEET }

    private final String label;
    private final String unit;
    private final Frequency frequency;
    private final LiquiditySource source;
    private final Group group;
    private final String description;
    private final List<String> dependencies;

    LiquiditySeries(String label, String unit, Frequency frequency, LiquiditySource source, Group group, String description) {
        this.label = label;
        this.unit = unit;
        this.frequency = frequency;
        this.source = source;
        this.group = group;
        this.description = description;
        this.dependencies = List.of();
    }

    LiquiditySeries(String label, String unit, Frequency frequency, Group group, String description, String... dependencies) {
        this.label = label;
        this.unit = unit;
        this.frequency = frequency;
        this.source = null;
        this.group = group;
        this.description = description;
        this.dependencies = List.of(dependencies);
    }

    private static final Map<String, LiquiditySeries> BY_CODE = Arrays.stream(values())
            .collect(Collectors.toUnmodifiableMap(Enum::name, Function.identity()));

    public static Optional<LiquiditySeries> find(String code) {
        return Optional.ofNullable(code == null ? null : BY_CODE.get(code));
    }

    public String code() { return name(); }
    public String label() { return label; }
    public String unit() { return unit; }
    public Frequency frequency() { return frequency; }
    public LiquiditySource source() { return source; }
    public Group group() { return group; }
    public String description() { return description; }
    /** Raw series codes a derived series is computed from (empty for raw series). */
    public List<String> dependencies() { return dependencies; }

    public Kind kind() { return source == null ? Kind.DERIVED : Kind.RAW; }

    public boolean isDerived() { return source == null; }

    /** True when the series (or any of its inputs) comes from FRED and therefore needs the API key. */
    public boolean needsFred() {
        if (source == LiquiditySource.FRED) return true;
        return dependencies.stream().anyMatch(d -> find(d).map(s -> s.source == LiquiditySource.FRED).orElse(false));
    }
}
