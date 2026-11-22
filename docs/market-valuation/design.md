# 美股估值监测（Market Valuation Monitor）设计文档

> 版本：v1.0（2026-11-22）
> 状态：待实现
> 读者：实现者（Sonnet）与项目所有者
> 姊妹模块：[美元流动性监测](../liquidity-monitor/design.md)（本模块的结构、风格、交付方式均与之对齐）

---

## 0. 实现者须知（先读这一节）

1. **只做本文档描述的内容**。不要修改美元流动性模块的任何文件（`service/liquidity/**`、`features/liquidity/**`、`V4`/`V5` 迁移）；允许**只读引用**其中的公共类 / 组件（见 §5.1、§6.2 的“复用清单”）。遇到文档未覆盖的细节，选最简单、与现有代码风格一致的做法，并在交付说明中列出。
2. 后端 schema 由 **Flyway** 管理，`spring.jpa.hibernate.ddl-auto=validate`：新增实体**必须**同时新增 `V6__market_valuation.sql`，列类型需与实体严格一致，否则启动失败。
3. 所有外部地址、页面结构、口径陷阱都已在本机实测（2026-11-21 ~ 22，见 §4 与附录 A），**不要凭记忆改用其他接口**。FRED 序列 ID 中标注“待验证”的，若返回 400 “series does not exist”，在交付说明中列出，不要自行替换。
4. 测试**不得访问真实网络**：每个解析器都写成纯函数（输入字符串 / `JsonNode`，输出序列点），用附录 A 的 fixture 测试。
5. 按 §10 的阶段顺序交付，每个阶段结束都要跑通 §11 的校验命令。
6. 用户是**长期投资者**：本模块**不做盘中实时**，只做“日度更新 + 打开页面时按需刷新”（§5.4）。

---

## 1. 目标与非目标

### 1.1 目标

把“市场整体贵不贵、盈利强不强”这件事做成一个**可自动更新、可回看长历史、可一键导出给 AI 分析**的监测模块。它回答三个问题：

| 问题 | 指标层 | 核心指标 |
|---|---|---|
| **出价贵不贵？**（绝对估值） | A | 席勒 CAPE、TTM PE、远期 PE、PS、巴菲特指标（股市总市值 / GDP） |
| **相对债券值不值？**（相对估值） | B | 实际股权风险溢价 = 1/CAPE − 10 年 TIPS 实际利率；名义 ERP；远期 ERP |
| **资产赚不赚钱？**（盈利能力） | D | TTM EPS 及同比、净利率、ROE（= PB / PE 恒等式）、企业利润占 GDP、FactSet 每周的 EPS / 营收增速与远期 EPS 修正 |

辅以：

- **C 多市场 PE 对比**：标普 500、纳指 100、道指、罗素 2000、中国、中国香港、日本，当前 PE 相对 1/5/10/20 年均值的 z 分数与 5 档标签。
- **E 结构与情绪**：等权 / 市值加权（RSP/SPY）比值（判断“贵是否只贵在头部”）、VIX。
- **估值温度计**：5 个估值分量历史分位的平均，0–100。
- **回报拆解**：近 1/3/5/10 年的指数涨幅 = EPS 增长贡献 + 估值扩张贡献。
- **PB–ROE 散点**：盈利能力与估值的联动。

### 1.2 非目标

- 不做盘中实时行情、不做交易信号、不做推送通知。
- 不做周报 / 月报快照（用户自己看图 + 问 AI；以“复制给 AI 的摘要”替代，§6.8）。
- 不做阈值表 / 红黄绿灯编辑：估值没有“正常值”，统一用**历史分位**着色（§3.6）。
- 不抓付费数据；纳指 100 的 ROE / 净利率 / ROIC、回购收益率等无免费来源的数据只支持**手动序列**。
- 不改造现有模块（唯一例外见 §5.8：`HttpClientConfig` 新增一个 bean、`pom.xml` 新增 PDFBox、首页 / 路由注册）。

### 1.3 设计核心：估值 = 高频价格 ÷ 低频基本面

基本面（EPS、10 年平均实际 EPS、每股净资产、每股销售额、GDP、Z.1 股权市值）只有月度 / 季度数据，而价格是日度的。本模块统一用一个纯函数生成**日度估值序列**：

```
隐含基本面 F(锚点) = 锚点价格 / 锚点估值          （对 P/X 类比率）
日度估值(d)       = 价格(d) / F(最近一个日期 ≤ d 的锚点)
```

这样 CAPE / PE / PB / PS / 股息率 / 巴菲特指标都能从 1990 年起得到每日序列，并在每次同步后给出“截至最近收盘”的值。它与流动性模块中 IORB 的 as-of 连接是同一思路。所有“日度外推值”在界面上标注“估算”。

---

## 2. 命名与入口

| 项 | 值 |
|---|---|
| 中文名 | **美股估值监测** |
| 英文标签 | `MARKET VALUATION` |
| ModuleId / 路由 | `market-valuation` → `/market-valuation` |
| 首页分组 | 已有的「宏观监测 / MACRO」分组，放在「美元流动性监测」之后 |
| 图标 | `🌡️` |
| 首页描述 | 追踪 CAPE、巴菲特指标、股权风险溢价、远期 PE 与指数盈利能力，判断美股估值冷热 |
| 后端 API 前缀 | `/api/market-valuation` |
| 后端包 | `com.stockcard.service.marketvaluation` |
| 表名前缀 | `mv_` |

> 注意：现有的 `valuation` 模块（`ValuationController` / `features/valuation`）是**个股估值**，与本模块无关，不要复用其表或代码。

---

## 3. 指标体系

单位约定：**比率用倍数（x）**，**收益率 / 利差 / 增速 / 利润率用 %（百分数）**，**金额统一换算成十亿美元（bn）**，指数点位用 `pt`。

### 3.1 原始序列（从外部拉取并入库）

#### 3.1.1 multpl.com（标普 500 基本面与估值，HTML 表格）

| code | 名称 | 单位 | 页面路径（`https://www.multpl.com/` + …） | 日期约定 | 历史起点 | 实测最新（2026-11-21） |
|---|---|---|---|---|---|---|
| `SPX_CAPE` | 席勒 PE（CAPE） | x | `shiller-pe/table/by-month` | 月初 | 1871 | Nov 1, 2026 → 39.82 |
| `SPX_PE` | TTM PE | x | `s-p-500-pe-ratio/table/by-month` | 月初 | 1871 | — |
| `SPX_DY` | 股息率 | % | `s-p-500-dividend-yield/table/by-month` | 月末 | 1871 | Oct 31, 2026 → 1.06%（估） |
| `SPX_PB` | 市净率 | x | `s-p-500-price-to-book/table/by-quarter` | 季末 | 1999-12-31 | — |
| `SPX_PS` | 市销率 | x | `s-p-500-price-to-sales/table/by-quarter` | 季末 | 2000-12-31 | — |
| `SPX_EPS` | TTM 每股收益（报告口径） | pt | `s-p-500-earnings/table/by-month` | 月末 | 1871 | Jun 30, 2026 → 298.03 |
| `SPX_SPS` | TTM 每股销售额 | pt | `s-p-500-sales/table/by-quarter` | 季末 | 2000-12-31 | Sep 30, 2025 → 2,042.16 ⚠️滞后 |
| `SPX_BVPS` | 每股净资产 | pt | `s-p-500-book-value/table/by-quarter` | 季末 | 1999-12-31 | Sep 30, 2025 → 1,270.32 ⚠️滞后 |

**“现值”行 → `*_SPOT` 序列**：`SPX_CAPE / SPX_PE / SPX_DY / SPX_PB / SPX_PS` 五张表的**第一行**是当日估计值（例如 `Nov 20, 2026 † 36.44`），日期不符合该表的日期约定。规则：

- 第一行的日期**不符合**日期约定（月初 / 月末 / 季末）→ 写入 `<CODE>_SPOT`（例如 `SPX_CAPE_SPOT`），`estimate=true`。每天同步都会新增一条，**从上线起逐日积累** multpl 自己算的现值。
- 其余行写入 `<CODE>`。带 `<abbr title="Estimate">†</abbr>` 的行 `estimate=true`（之后的同步会覆盖成正式值）。
- **日期晚于今天（北京时间）的行一律丢弃**（实测：股息率表会出现 `Nov 30, 2026` 这种未来月末的估计行）。

#### 3.1.2 Yahoo Finance chart API（日度价格）

| code | 名称 | 单位 | Yahoo 代码 | 取值 | 历史起点 |
|---|---|---|---|---|---|
| `PX_SPX` | 标普 500 | pt | `^GSPC` | `close` | `app.market-valuation.price-history-start`（默认 1990-01-01） |
| `PX_NDX` | 纳指 100 | pt | `^NDX` | `close` | 同上 |
| `PX_DJI` | 道琼斯工业 | pt | `^DJI` | `close` | 同上 |
| `PX_RUT` | 罗素 2000 | pt | `^RUT` | `close` | 同上 |
| `PX_W5000` | Wilshire 5000 | pt | `^W5000` | `close` | 同上 |
| `VIX` | VIX | pt | `^VIX` | `close` | 同上 |
| `PX_SPY` | SPY（复权） | USD | `SPY` | `adjclose` | 1993 |
| `PX_RSP` | RSP 等权（复权） | USD | `RSP` | `adjclose` | 2003-05 |

#### 3.1.3 worldperatio.com（多市场 PE 与滚动统计，HTML）

市场键 `M` 与页面：

| M | 名称 | 路径（`https://worldperatio.com/` + …） | 实测 PE（2026-11-20） | 口径说明 |
|---|---|---|---|---|
| `SPX` | 标普 500 | `index/sp-500/` | 22.55 | 基于指数 ETF 的 TTM PE |
| `NDX` | 纳指 100 | `index/nasdaq-100/` | 26.37 | 同上 |
| `DJI` | 道琼斯 | `index/dow-jones/` | 19.23 | 同上 |
| `RUT` | 罗素 2000 | `index/russell-2000/` | 15.27 | 同上 |
| `CN` | 中国市场 | `area/china/` | 8.16 | **市场级口径（MSCI / ETF 代理），不是沪深 300** |
| `HK` | 中国香港市场 | `area/hong-kong/` | 12.17 | **市场级口径，不是恒生指数** |
| `JP` | 日本市场 | `area/japan/` | 14.31 | **市场级口径，不是日经 225** |

每个市场写入的序列（`N ∈ {1, 5, 10, 20}`）：

| code | 含义 | 单位 |
|---|---|---|
| `WPE_{M}` | 当前 PE（页面上的 “calculated on {日期}” 作为 `obs_date`） | x |
| `WPE_{M}_AVG{N}Y` | 过去 N 年滚动均值 μ | x |
| `WPE_{M}_SD{N}Y` | 过去 N 年标准差 σ = “1 Std Dev range” 上沿 − μ | x |

worldperatio **没有原始历史序列**，所以 `WPE_*` 从上线当天开始逐日积累；但滚动 μ / σ 立即提供了“相对历史”的参照，z 分数第一天就可用。

> 注意：worldperatio 的标普 500 PE（22.55）与 multpl 的 TTM PE（23.55）、FactSet 的 TTM PE（22.9）**口径不同**，三者分别建序列，**绝不合并**。

#### 3.1.4 FactSet Earnings Insight（每周 PDF）

- 文件地址：`https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_{MMDDYY}[A].pdf`。
- 最新一期入口 `https://www.factset.com/earningsinsight` 302 到上面的地址（实测为 `EarningsInsight_112026A.pdf`）。**不依赖这个重定向**，直接按日期构造文件名（§4.4）。
- 实测历史：`111717`（2017-11-17）、`112020`、`111921`、`111723`、`111524`、`112125`、`112026` 均 200；`111816`（2016）、`111822`、`103025` 为 404。即 **2017 年下半年起每周基本都有**，个别周缺失或在周四发布。

| code | 名称 | 单位 | 来源句式（附录 A.4） | 必需 |
|---|---|---|---|---|
| `FS_FWD_PE` | 远期 12 个月 PE | x | “The forward 12-month P/E ratio for the S&P 500 is **17.1**.” | ✅ |
| `FS_FWD_PE_AVG5Y` | 远期 PE 5 年均值 | x | “… the 5-year average (**19.8**) …” | ✅ |
| `FS_FWD_PE_AVG10Y` | 远期 PE 10 年均值 | x | “… the 10-year average (**19.1**).” | ✅ |
| `FS_TTM_PE` | TTM PE（FactSet 口径） | x | “The trailing 12-month P/E ratio is **22.9**, …” | |
| `FS_EPS_G_Q` | 当季混合 EPS 同比增速 | % | “For Q3 2026, the blended (year-over-year) earnings growth rate for the S&P 500 is **32.9**%.”（`decline` 句式见 §4.4） | |
| `FS_REV_G_Q` | 当季混合营收同比增速 | % | “… the blended revenue growth rate for the third quarter is **14.6**% …” | |
| `FS_BEAT_EPS` | EPS 超预期公司占比 | % | “**84**% of S&P 500 companies have reported a positive EPS surprise” | |
| `FS_EPS_G_NY` / `FS_REV_G_NY` | 下一自然年 EPS / 营收增速预期 | % | “For CY **2027**, analysts are projecting earnings growth of **16.4**% and revenue growth of **10.0**%.”（仅当年份 = 报告年份 + 1 时写入） | |
| `FS_TARGET` | 自下而上目标价 | pt | “The bottom-up target price for the S&P 500 is **9,099.54**, which is 26.8% above the closing price of **7,175.83**.” | |
| `FS_CLOSE` | 报告引用的收盘价 | pt | 同上句 | |

`obs_date` = 文件名中的日期（MMDDYY）。当季标签（例如 `Q3 2026`）写入 `mv_factset_report.fiscal_quarter`，供界面显示“FS_EPS_G_Q 对应哪个季度”。

#### 3.1.5 FRED（复用流动性模块已配置的 FRED Key）

| code | 名称 | 单位 | FRED ID | 频率 | 日期处理 | 状态 |
|---|---|---|---|---|---|---|
| `GDP` | 名义 GDP（季调年化） | bn | `GDP` | 季 | 保持季初（流量） | 已知 |
| `EQ_NONFIN` | 非金融企业股权市值（负债方） | bn | `NCBEILQ027S` | 季 | **季初 → 季末**（存量，见下） | ✅ 已核实存在 |
| `EQ_FIN` | 国内金融部门股权市值（负债方） | bn | `FBCELLQ027S` | 季 | 季初 → 季末 | ✅ 已核实存在 |
| `NW_NONFIN` | 非金融企业净值（市值口径） | bn | `TNWMVBSNNCB` | 季 | 季初 → 季末 | ⚠️ 待验证 |
| `CP_AFTER_TAX` | 企业税后利润（含 IVA、CCAdj） | bn | `CPATAX` | 季 | 保持季初（流量） | ✅ 已核实存在 |
| `UST10Y` | 10 年期国债收益率 | % | `DGS10` | 日 | 原样 | 已知 |
| `TIPS10Y` | 10 年期 TIPS 实际收益率 | % | `DFII10` | 日（2003 起） | 原样 | 已知 |

- **单位换算**：与流动性模块相同，读 `/fred/series` 的 `units`：含 `Millions` 的 ÷ 1000，其余原样。直接调用公共静态方法 `FredClient.unitDivisor(JsonNode)` 与 `FredClient.parseObservations(JsonNode, double)`（只读复用）。
- **季初 → 季末**：FRED 把 Z.1 季度存量的日期记为季度第一天（例如 Q2 记为 `2026-04-01`），但数值是**季末**存量。入库时把这三个序列的日期改为 `date.plusMonths(3).minusDays(1)`（Q2 → `2026-06-30`），这样与指数价格对齐时不会错位一个季度。GDP 与 CPATAX 是季度流量，保持季初日期。
- 没有 FRED Key 时，FRED 数据源记为 `SKIPPED`，依赖它的派生指标（巴菲特指标、ERP、托宾 Q、利润占 GDP）返回空数组，前端显示“需要 FRED API Key → 去首页 ⚙ 设置”。

### 3.2 派生序列（读取时计算，不入库）

#### 3.2.1 日度估值（§1.3 的锚点外推）

| code | 名称 | 单位 | 锚点来源 | 价格 | 类型 |
|---|---|---|---|---|---|
| `SPX_CAPE_D` | CAPE（日度估算） | x | `SPX_CAPE` + `SPX_CAPE_SPOT` | `PX_SPX` | P/X |
| `SPX_PE_D` | TTM PE（日度估算） | x | `SPX_PE` + `SPX_PE_SPOT` | `PX_SPX` | P/X |
| `SPX_PB_D` | PB（日度估算） | x | `SPX_PB` + `SPX_PB_SPOT` | `PX_SPX` | P/X |
| `SPX_PS_D` | PS（日度估算） | x | `SPX_PS` + `SPX_PS_SPOT` | `PX_SPX` | P/X |
| `SPX_DY_D` | 股息率（日度估算） | % | `SPX_DY` + `SPX_DY_SPOT` | `PX_SPX` | 收益率 |
| `SPX_EY_D` | 盈利收益率 = 100 / `SPX_PE_D` | % | — | — | — |
| `SPX_CAPE_EY_D` | CAPE 收益率 = 100 / `SPX_CAPE_D` | % | — | — | — |

**锚点价格规则（必须实现并有单测）**：

| 锚点行 | 锚点价格 |
|---|---|
| 月初 / 月末约定的月度行（如 `SPX_CAPE` 的 `2026-10-01`、`SPX_DY` 的 `2026-10-31`） | 该**自然月**内所有 `PX_SPX` 收盘价的算术平均（Shiller / multpl 月度值使用月均价）；该月没有价格 → 丢弃该锚点 |
| 季末约定的季度行（`SPX_PB`、`SPX_PS`） | `PX_SPX` 在该日期的 as-of 收盘价（≤ 该日的最近一个） |
| `*_SPOT` 行 | `PX_SPX` 在该日期的 as-of 收盘价 |

**计算**：

```
P/X 类：  F = anchorPrice / anchorValue；   value(d) = PX_SPX(d) / F(asOf d)
收益率类：F = anchorValue × anchorPrice；   value(d) = F(asOf d) / PX_SPX(d)
```

- `asOf d` = 锚点日期 ≤ d 的最近一个锚点（月度行与 SPOT 行放在一起，按日期排序）。
- 只在 `PX_SPX` 有收盘价的日期产出；第一个锚点之前不产出。
- 锚点的日期就是该行的日期：月初约定的 `2026-11-01` 行，其“隐含基本面”从 11-01 起生效，直到下一个锚点（例如 `SPX_CAPE_SPOT` 的 `2026-11-20`）。

#### 3.2.2 巴菲特指标与托宾 Q

| code | 名称 | 单位 | 公式 |
|---|---|---|---|
| `US_EQ_MV` | 美国企业股权总市值 | bn | `EQ_NONFIN + EQ_FIN`（同一季末日期都有值才产出） |
| `BUFFETT_Q` | 巴菲特指标（季度，官方口径） | % | `US_EQ_MV(季末 q) / GDP(同一季度，即季初 = q 所在季度第一天) × 100` |
| `BUFFETT_D` | 巴菲特指标（日度估算） | % | `US_EQ_MV(q*) × PX_W5000(d) / PX_W5000(asOf q*) / GDP(asOf d) × 100`，q* = ≤ d 的最近一个季末；`GDP(asOf d)` = 季初日期 ≤ d 的最近一个 GDP |
| `TOBIN_Q` | 托宾 Q（非金融企业） | x | `EQ_NONFIN / NW_NONFIN`（同一季末） |

> 历史回看时，`BUFFETT_D` 用到的 Z.1 数据在当时实际上还没发布（约滞后 10 周），这属于“事后视角”。作为监测工具可以接受，界面注明即可。

#### 3.2.3 相对估值（股权风险溢价）

| code | 名称 | 单位 | 公式 | 历史起点 |
|---|---|---|---|---|
| `ERP_REAL_D` | **实际 ERP**（主指标） | % | `SPX_CAPE_EY_D − TIPS10Y`（同日都有值才产出） | 2003 |
| `ERP_NOM_D` | 名义 ERP（Fed 模型） | % | `SPX_EY_D − UST10Y` | 1990 |
| `ERP_FWD` | 远期 ERP | % | `100 / FS_FWD_PE − UST10Y(asOf 报告日)` | 2017 |

**为什么以实际 ERP 为主**：CAPE 的分母是**经通胀调整**的 10 年平均 EPS，是实际量，应当与**实际利率**（TIPS）比较；名义 ERP 在高通胀期会系统性失真。名义 ERP 与远期 ERP 作为参照保留。

#### 3.2.4 盈利能力

| code | 名称 | 单位 | 公式 |
|---|---|---|---|
| `SPX_EPS_YOY` | TTM EPS 同比 | % | `SPX_EPS(m) / SPX_EPS(m 的 12 个月前同一月末) − 1`，× 100 |
| `SPX_NET_MARGIN` | 净利率 | % | `SPX_EPS(q) / SPX_SPS(q) × 100`，q = `SPX_SPS` 的季末日期（`SPX_EPS` 月末表包含季末） |
| `SPX_ROE` | ROE | % | `SPX_EPS(q) / SPX_BVPS(q) × 100`（期末净资产口径；回购会使其偏高，界面注明） |
| `PROFIT_GDP` | 企业税后利润 / GDP | % | `CP_AFTER_TAX / GDP × 100`（同一季初日期） |
| `FS_FWD_EPS` | 远期 12 个月 EPS（隐含） | pt | `FS_CLOSE / FS_FWD_PE`；没有 `FS_CLOSE` 时用 `PX_SPX(asOf 报告日) / FS_FWD_PE` |
| `FS_FWD_EPS_CHG_4W` / `FS_FWD_EPS_CHG_13W` | 远期 EPS 4 周 / 13 周修正 | % | `FS_FWD_EPS(t) / FS_FWD_EPS(asOf t − 28 天 / 91 天) − 1`，× 100 |

> `FS_FWD_PE` 只保留一位小数，`FS_FWD_EPS` 有约 ±0.3% 的取整误差；4 周修正幅度小于 0.6% 时界面显示“≈ 持平”。

#### 3.2.5 多市场与结构

| code | 名称 | 单位 | 公式 |
|---|---|---|---|
| `WPE_{M}_Z{N}Y` | 当前 PE 相对 N 年的 z 分数 | σ | `(WPE_{M} − WPE_{M}_AVG{N}Y) / WPE_{M}_SD{N}Y`（同一日期） |
| `RSP_SPY` | 等权 / 市值加权 | x | `PX_RSP / PX_SPY`（同日都有值才产出） |

z 分数标签（与 worldperatio 方法一致）：

| 条件 | 标签 |
|---|---|
| z > +2 | 昂贵 |
| +1 < z ≤ +2 | 高估 |
| −1 ≤ z ≤ +1 | 合理 |
| −2 ≤ z < −1 | 低估 |
| z < −2 | 便宜 |

### 3.3 手动序列

与流动性模块相同：用户在界面上新建手动序列（code 必须以 `M_` 开头），逐条或批量录入 `(日期, 数值)`。预置“一键添加”按钮（不自动创建）：

| code | 名称 | 单位 | 用途 |
|---|---|---|---|
| `M_SPX_NET_MARGIN_FS` | 标普 500 净利率（FactSet 口径） | % | FactSet 不定期发布（如 2026Q3 的 14.9%），比 multpl 推导的净利率更及时 |
| `M_SPX_BUYBACK_YIELD` | 标普 500 回购收益率 | % | 计算股东总回报率（股息率 + 净回购率） |
| `M_NDX_ROE` | 纳指 100 ROE | % | 无免费来源 |
| `M_NDX_NET_MARGIN` | 纳指 100 净利率 | % | 无免费来源 |
| `M_NDX_FWD_PE` | 纳指 100 远期 PE | x | 无免费来源 |

### 3.4 估值温度计（0–100）

| 分量 | 当前值 | 历史分布（分位基准） | 方向 |
|---|---|---|---|
| CAPE | `SPX_CAPE_D` 最新值 | `SPX_CAPE`（月度，1871 起） | 越高越贵 |
| 巴菲特指标 | `BUFFETT_D` 最新值 | `BUFFETT_Q`（季度，1947 起） | 越高越贵 |
| 市销率 | `SPX_PS_D` 最新值 | `SPX_PS`（季度，2000 起） | 越高越贵 |
| 远期 PE | `FS_FWD_PE` 最新值 | `FS_FWD_PE` 重采样到月末（2017 起） | 越高越贵 |
| 实际 ERP | `ERP_REAL_D` 最新值 | `ERP_REAL_D` 重采样到月末（2003 起） | **越低越贵**（分位取 100 − p） |

- **窗口** `window ∈ {10Y, 20Y, SINCE_1990, ALL}`，默认 `20Y`；分布取 `[最新日期 − 窗口, 最新日期]` 内的基准观测。
- **分位**：`p = (窗口内 < 当前值的个数 + 0.5 × 等于当前值的个数) / 窗口样本数 × 100`。
- **样本不足**（月度 < 36、季度 < 16）→ 该分量标记“样本不足”，不计入温度。窗口比数据更长时，使用全部可用数据，并返回 `sampleStart` 供界面显示“实际样本起点”。
- **温度** = 可用分量“越贵越高”分位的算术平均。PB、托宾 Q **不计入**（回购压缩净资产，PB 在美股长期失真），只作参考。
- **档位**：

| 温度 | 档位 |
|---|---|
| < 20 | 极便宜 |
| 20–40 | 偏便宜 |
| 40–60 | 中性 |
| 60–80 | 偏贵 |
| 80–95 | 昂贵 |
| ≥ 95 | 历史极端 |

- **为什么允许切换窗口**：指数的行业结构在变（从重资产工业 + 金融，转向轻资产软件 + 平台），估值中枢会永久迁移。全历史分位容易“长期高估”；10 年分位又可能把泡沫期当常态。界面同时展示多个窗口，由用户判断。

### 3.5 回报拆解（估值扩张 vs 盈利增长）

对期限 `H ∈ {1Y, 3Y, 5Y, 10Y}`，令 t = `PX_SPX` 最新日期，s = t − H 的 as-of 交易日：

```
总回报(对数) = ln(P_t / P_s)
估值贡献    = ln(PE_t / PE_s)          （PE 用 SPX_PE_D）
盈利贡献    = ln(EPS_t / EPS_s)，EPS = P / SPX_PE_D   → 恒有 总回报 = 估值贡献 + 盈利贡献
```

同时用 `SPX_CAPE_D` 计算一组（“CAPE 口径”：盈利项 = 10 年平滑盈利），并在 FactSet 数据覆盖 s 时，用 `FS_FWD_PE`（as-of）计算“远期口径”。返回三组结果，并把对数值换算成百分数：`exp(x) − 1`。

### 3.6 着色规则（取代阈值灯）

所有有方向的指标（catalog 中 `direction ≠ NONE`）按**当前窗口分位**着色：`≥ 80` 红、`60–80` 橙、`40–60` 灰、`20–40` 浅绿、`< 20` 绿（“越低越贵”的指标先取 `100 − p`）。多市场表用 z 分数标签着色。盈利类指标不着色，只显示箭头（与上期比较）。

---

## 4. 数据源（全部已在本机实测）

### 4.1 multpl.com

- URL：`https://www.multpl.com/{path}`（见 §3.1.1），GET，一次返回完整历史（每页约 20–150KB）。
- 结构（附录 A.1）：`<table id="datatable">` 内每个 `<tr>` 有两个 `<td>`：
  - `td[0]`：日期，格式 `MMM d, yyyy`（`Locale.US`，例如 `Nov 20, 2026`、`Jan 1, 1871`）。
  - `td[1]`：可能含 `<abbr title="Estimate">†</abbr>`（→ `estimate=true`）、`&#x2002;`（en space）、千分位逗号、`%`。去标签、去实体、去 `,` 与 `%`、trim 后解析 double。
- 第一行是表头（`<th>`），跳过。
- **用正则解析即可**（与 QE 雷达的 `FedHtml` 相同做法，不引入 jsoup）：`<tr[^>]*>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>`（DOTALL）。
- 日期约定判定：`FIRST_OF_MONTH` → `dayOfMonth == 1`；`MONTH_END` → `date == date.withDayOfMonth(lengthOfMonth)`；`QUARTER_END` → 月末且月份 ∈ {3, 6, 9, 12}。
- **合理性检查**（防止页面结构变化写入垃圾数据）：CAPE ∈ [3, 100]，PE ∈ [3, 200]（multpl 在 2009 年等盈利塌陷期 PE 可达 100+），PB ∈ [0.3, 20]，PS ∈ [0.2, 20]，DY ∈ [0, 20]，EPS / SPS / BVPS > 0。不满足的行丢弃；**整页一行都解析不出** → 该表失败，日志消息写“页面结构可能已变化：{path}”。
- 实测：本机网络、`stock-card/1.0` 与浏览器 UA 都返回 200。

### 4.2 Yahoo Finance chart API

- URL：`https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1={epochSec}&period2={epochSec}&interval=1d&includeAdjustedClose=true`，`symbol` 中的 `^` 编码为 `%5E`。
- ⚠️ **不要用 `range=max`**：实测它返回的是**月线**（`^GSPC` 只有 169 根）。必须用 `period1/period2` 才能拿到日线（`^GSPC` 2000 年至今 6763 根）。
- 响应（附录 A.2）：`chart.result[0].timestamp[]`（秒），`indicators.quote[0].close[]`，`indicators.adjclose[0].adjclose[]`；`meta.exchangeTimezoneName`（如 `America/New_York`）。
  - 日期 = `Instant.ofEpochSecond(ts).atZone(ZoneId.of(exchangeTimezoneName)).toLocalDate()`。
  - `close` / `adjclose` 中可能有 `null` → 跳过。
  - `chart.error` 非空 → 抛异常。
- 在美股交易时段内同步时，最后一根是**未完成的当日 K 线**：照常写入（下一次同步回看 10 天会覆盖）。
- 实测：Java / PowerShell 客户端返回 200；**curl 会被 403**（TLS 指纹问题），排查时不要用 curl 判断可用性。这是非官方接口，可能随时变化：失败只影响 YAHOO 数据源，日志记 FAILED。

### 4.3 worldperatio.com

- URL：`https://worldperatio.com/{path}`（见 §3.1.3），每页约 350KB。
- 解析：先去掉 `<script>…</script>`、`<style>…</style>`，再去掉所有标签，把 `&#038;`、`&amp;` 解码为 `&`，连续空白折叠为一个空格，然后：
  - 当前值：`P/E\) Ratio for (.+?) is ([0-9.]+) , calculated on (\d{1,2} [A-Za-z]+ \d{4})`，日期格式 `d MMMM yyyy`（`Locale.US`）。
  - 滚动统计：`(\d+)Y Average: ([0-9.]+) \W* 1 Std Dev range: \[([0-9.]+) , ([0-9.]+)\]`，每个 N 取**第一个**匹配；`SD = 上沿 − 均值`。（实测分隔符为 `·`，U+00B7。）
- 合理性检查：PE ∈ [1, 200]；SD > 0。当前值解析失败 → 该市场失败（不影响其他市场，消息中列出失败的市场）。
- ⚠️ 中国 / 香港 / 日本**没有** `index/csi-300/` 这类页面（实测返回 200，但页面里没有数据）。只能使用 `area/{china|hong-kong|japan}/`。

### 4.4 FactSet Earnings Insight（PDF）

- 新增依赖：`org.apache.pdfbox:pdfbox`（使用 Maven Central 上最新的 3.0.x）。文本提取：`Loader.loadPDF(bytes)` + `PDFTextStripper`（`setStartPage(1)`、`setEndPage(8)`；关键数据都在前几页）。
- **每周候选文件**：对周五 `F`，依次尝试：`F.pdf`、`F` + `A.pdf`、`(F−1)`（周四）`.pdf`、`(F−1)` + `A.pdf`。文件名日期格式为 `MMddyy`。第一个 200 即为该周报告，`report_date` = 文件名中的日期；4 个都 404 → 该周记为 `NOT_FOUND`。
- **请求节流**：FactSet 两次请求至少间隔 1.5 秒；单次同步最多处理 `app.market-valuation.factset-max-per-run`（默认 60）份 PDF。历史回填会分多次同步**渐进完成**（每小时的补偿任务会继续，§5.4）。每份约 1MB。
- **文本规范化**：所有空白折叠为一个空格；把 `\uF0B7`、`•`、`\uFFFD` 替换为空格；`’` → `'`。
- **正则**（大小写不敏感；数值去掉千分位逗号）：

| 字段 | 正则 |
|---|---|
| 远期 PE 三元组 | `forward 12-month P/E ratio for the S&P 500 is (\d+\.\d)\.?[^()]*?5-year average \((\d+\.\d)\)[^()]*?10-year average \((\d+\.\d)\)` |
| TTM PE | `trailing 12-month P/E ratio is (\d+\.\d)` |
| 当季 EPS 增速 | `For (Q[1-4] \d{4}), the blended (?:\(year-over-year\) )?earnings (growth rate\|decline) for the S&P 500 is (-?\d+\.\d)%` |
| 当季营收增速 | `blended revenue (growth rate\|decline) for (?:the )?(?:Q[1-4](?: \d{4})?\|(?:first\|second\|third\|fourth) quarter) is (-?\d+\.\d)%` |
| 超预期比例 | `(\d{1,3})% of (?:the )?S&P 500 companies (?:have )?reported (?:a )?positive EPS surprises?` |
| 下一年增速 | `For CY ?(\d{4}), analysts are projecting earnings growth of (-?\d+\.\d)% and revenue growth of (-?\d+\.\d)%`（遍历所有匹配，取年份 = 报告年份 + 1 的那个） |
| 目标价 | `bottom-up target price for the S&P 500 is ([\d,]+\.\d+), which is (-?\d+\.\d)% (above\|below) the closing price of ([\d,]+\.\d+)` |

（表格中的 `\|` 是 Markdown 转义，代码里写 `|`。）

- **符号规则**：增速句式中出现 `decline` 且数值为正 → 取负（实测 2020-11-20：“the blended earnings decline for the S&P 500 is -6.3%”，已经带负号，不要再取一次负）。目标价句式为 `below` → 涨幅取负。
- **状态**：远期 PE 三元组解析成功 → `PARSED`（可选字段缺失只记录在 `message` 中，例如 `missing: FS_REV_G_Q`）；三元组失败 → `PARSE_FAILED`，不写观测，下次 FULL 同步时重试。
- 实测：2017-11-17、2020-11-20、2026-11-20 三期的远期 PE 句式完全一致（附录 A.4）。

### 4.5 FRED API

与流动性模块相同（`https://api.stlouisfed.org/fred/series/observations?...`，Key 通过 `AppConfigService.resolveFredApiKey()` 获取）。⚠️ `fred.stlouisfed.org` 网页 / CSV 在本机**超时**（2026-11-22 再次实测），禁止使用。

### 4.6 发布时间与同步时间

| 数据 | 更新 | 北京时间 |
|---|---|---|
| Yahoo 日线 | 美股收盘（16:00 ET） | 04:00（夏令时）/ 05:00（冬令时） |
| multpl 现值 | 美股收盘后 | 次日清晨 |
| worldperatio | 美股收盘后（页面显示前一交易日） | 次日清晨 |
| FactSet Earnings Insight | 每周五（节假日提前到周四） | 周六清晨 |
| FRED DGS10 / DFII10 | T+1 | 次日 |
| GDP / CPATAX / Z.1 | 季度，滞后 1–3 个月 | — |
| multpl EPS / SPS / BVPS | 不定期，**滞后严重**（EPS 约 5 个月；SPS / BVPS 实测滞后约 14 个月） | — |

---

## 5. 后端设计

### 5.1 包结构

```
com.stockcard
├── controller/MarketValuationController.java
├── config/MarketValuationConfig.java           (单线程同步 executor，参照 LiquidityConfig)
├── entity/
│   ├── MvObservation.java                      (@IdClass MvObservationId)
│   ├── MvObservationId.java
│   ├── MvManualSeries.java
│   ├── MvFetchLog.java
│   └── MvFactsetReport.java
├── repository/（每个实体一个 Repository）
└── service/marketvaluation/
    ├── MvSeries.java              (enum：§3.1 + §3.2 的目录元数据；WPE_* 由代码按市场 × N 生成)
    ├── MvMarket.java              (enum：SPX/NDX/DJI/RUT/CN/HK/JP，含 worldperatio 路径与中文名)
    ├── MvSource.java              (enum: YAHOO, MULTPL, WPR, FACTSET, FRED, MANUAL)
    ├── MvSourceClient.java        (接口)
    ├── MvHttp.java                (getJson / getText / getBytes、重试、按主机节流、api_key 脱敏)
    ├── YahooClient.java
    ├── MultplClient.java
    ├── WorldPeClient.java
    ├── FactsetClient.java         (PDF 下载 + 文本提取 + 正则解析；周次簿记写 mv_factset_report)
    ├── MvFredClient.java
    ├── MvSyncService.java         (拉取、upsert、日志、定时 / 补偿 / 按需刷新)
    ├── MvCalcService.java         (派生序列：锚点外推、巴菲特、ERP、盈利、z 分数)
    ├── MvStatsService.java        (分位、窗口统计、温度计)
    ├── MvDecompositionService.java
    ├── MvDashboardService.java
    └── MvManualService.java
```

**只读复用清单**（不修改源文件）：`liquidity.SeriesPoint`（record）、`liquidity.FredClient.unitDivisor / parseObservations`（public static）、`liquidity.MissingApiKeyException`、`AppConfigService.resolveFredApiKey()`。

`MvSourceClient`：

```java
public interface MvSourceClient {
    MvSource source();
    /** 返回 seriesCode -> 观测；只负责拉取和解析，不碰数据库。estimate 标记通过 MvPoint 携带。 */
    Map<String, List<MvPoint>> fetch(LocalDate from, LocalDate to, FetchMode mode);
}
public record MvPoint(LocalDate date, double value, boolean estimate) {}
```

每个 Client 都把“HTTP 获取”与“解析”分开，解析写成 `static ... parse(String html | JsonNode root | String pdfText, ...)`，以便直接用 fixture 测试。FactsetClient 额外暴露 `static String extractText(byte[] pdf)` 与 `static FactsetParse parseText(String text, LocalDate reportDate)`。FactSet 的周次簿记需要读写数据库，由 `MvSyncService` 在调用前后处理（Client 只接收“要处理的周列表”，返回每周的结果）。

### 5.2 数据库（`V6__market_valuation.sql`）

```sql
-- Market valuation monitor (see docs/market-valuation/design.md). Never edit once released - add a new V<n> migration instead.
CREATE TABLE mv_observation (
    series_code VARCHAR(48)      NOT NULL,
    obs_date    DATE             NOT NULL,
    obs_value   DOUBLE PRECISION NOT NULL,
    source      VARCHAR(20)      NOT NULL,   -- YAHOO / MULTPL / WPR / FACTSET / FRED / MANUAL
    estimate    BOOLEAN          NOT NULL DEFAULT FALSE,
    fetched_at  TIMESTAMP        NOT NULL,
    PRIMARY KEY (series_code, obs_date)
);
CREATE INDEX idx_mv_obs_date ON mv_observation (obs_date);

CREATE TABLE mv_manual_series (
    code        VARCHAR(48)  PRIMARY KEY,    -- must start with "M_" so it can never clash with a built-in code
    name        VARCHAR(100) NOT NULL,
    unit        VARCHAR(20)  NOT NULL,
    description VARCHAR(500),
    created_at  TIMESTAMP    NOT NULL
);

CREATE TABLE mv_fetch_log (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    source        VARCHAR(20)  NOT NULL,
    mode          VARCHAR(20)  NOT NULL,     -- INCREMENTAL / FULL
    range_from    DATE,
    range_to      DATE,
    started_at    TIMESTAMP    NOT NULL,
    finished_at   TIMESTAMP,
    status        VARCHAR(20)  NOT NULL,     -- RUNNING / SUCCESS / PARTIAL / FAILED / SKIPPED
    rows_upserted INT          NOT NULL DEFAULT 0,
    message       VARCHAR(1000)
);

CREATE TABLE mv_factset_report (
    week_friday    DATE         PRIMARY KEY, -- the Friday of the week this row books
    report_date    DATE,                     -- date in the file name (Friday or Thursday); null when NOT_FOUND
    file_name      VARCHAR(60),
    status         VARCHAR(20)  NOT NULL,    -- PARSED / PARSE_FAILED / NOT_FOUND
    fiscal_quarter VARCHAR(10),              -- e.g. "Q3 2026" for FS_EPS_G_Q / FS_REV_G_Q
    message        VARCHAR(1000),
    fetched_at     TIMESTAMP    NOT NULL
);
```

- 实体写法、`DOUBLE PRECISION` 与 `double` 的映射参照 `LiquidityObservation`。
- 数据量：multpl 约 1.2 万行 + Yahoo 8 × 9,000 ≈ 7.2 万行 + FactSet 约 470 周 × 10 ≈ 5,000 行 + FRED 约 1.5 万行 + WPR 每天 63 行。H2 完全可以承受。
- `PARTIAL` 状态：一个数据源内部部分子项失败（例如 worldperatio 7 个市场中 1 个失败、multpl 8 张表中 1 张失败）——成功的部分照常入库。

### 5.3 写入：批量 upsert

与流动性模块相同，使用 `JdbcTemplate.batchUpdate` 执行 H2 原生语句：

```sql
MERGE INTO mv_observation (series_code, obs_date, obs_value, source, estimate, fetched_at)
KEY (series_code, obs_date) VALUES (?, ?, ?, ?, ?, ?)
```

每批 1000 行；每个数据源一个事务。

### 5.4 同步流程（`MvSyncService`）

```
sync(mode):
  if !running.compareAndSet(false, true) → 409 “同步进行中”
  try:
    for client in [Yahoo, Multpl, WorldPe, Fred, Factset]:   // 顺序执行，单个失败不影响其他；FactSet 最慢，放最后
        log = 新建 RUNNING 日志
        try:   points = client.fetch(from(client, mode), today, mode); rows = upsert(points); log → SUCCESS / PARTIAL
        catch MissingApiKeyException → SKIPPED，“未配置 FRED API Key”
        catch Exception             → FAILED，脱敏、截断后的异常信息（≤ 1000 字）
  finally: running.set(false)
```

**各数据源的增量范围**：

| 数据源 | FULL | INCREMENTAL |
|---|---|---|
| YAHOO | `price-history-start` → 今天 | 每个 symbol 的 `max(obs_date) − 10 天` → 今天（该 symbol 无数据时从 `price-history-start` 开始） |
| MULTPL | 整页（每张表一次请求，本来就是全历史） | 同 FULL（upsert 幂等） |
| WPR | 当前页 | 同 FULL |
| FRED | 1945-01-01 → 今天 | 日度序列：`max − 10 天`；季度序列：`max − 2 年`（GDP、利润会修订） |
| FACTSET | 从 `factset-history-start` 起，所有不在 `mv_factset_report` 中的周，以及 `PARSE_FAILED` 的周 | 最近 8 周中没有 `PARSED` 的周（`NOT_FOUND` 只在最近 3 周内重试），再加最多一批（受 `factset-max-per-run` 限制）尚未记录的历史周 |

FactSet 按周倒序处理（先最新、后历史），每次同步受 `factset-max-per-run` 限制。

**触发方式**：

1. **手动**：`POST /api/market-valuation/sync?mode=INCREMENTAL|FULL[&source=…]`，在单线程 executor 中执行，立即返回 `202`；前端轮询 `GET /sync/status`。
2. **定时**：`@Scheduled(cron = "${app.market-valuation.cron:0 30 6 * * *}", zone = "Asia/Shanghai")`，每天 06:30 增量同步一次。
3. **启动补偿 + 每小时检查**：参照 `LiquiditySyncService.catchUpIfDue()`。启动 2 分钟后及之后每小时检查一次：
   - `mv_observation` 为空 → FULL；
   - 最近一次成功同步早于 12 小时前 → 增量同步；
   - FactSet 历史回填未完成（`factset-history-start` 到今天之间存在未记录的周）→ 只对 FACTSET 跑一次增量（即处理下一批历史周）。
4. **打开页面时按需刷新**：`POST /api/market-valuation/refresh-if-stale`。最近一次成功同步早于 `app.market-valuation.stale-after`（默认 6 小时）且当前没有同步在运行 → 触发增量同步并返回 `{ triggered: true }`；否则返回 `{ triggered: false, lastSuccessAt }`。前端在模块挂载时调用一次。
5. **启动恢复**：参照 `LiquiditySyncService.recoverInterruptedRuns()`，把残留的 `RUNNING` 日志标为 `FAILED`。

**HTTP 客户端**：

- 在 `HttpClientConfig` 新增 `marketValuationRestTemplate` bean：连接超时 `app.http.connect-timeout`，读超时 `app.market-valuation.read-timeout:60s`，默认请求头 `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 stock-card/1.0`。
- `MvHttp`：结构参照 `LiquidityHttp`（重试 2 次、间隔 2 秒、429 重试、其他 4xx 不重试、`api_key` 脱敏），另外新增：
  - `getBytes(URI)`（PDF）。
  - `getBytesOrNull(URI)`：404 返回 null（FactSet 探测用）。
  - **按主机节流**：同一主机两次请求最小间隔默认 1 秒，`advantage.factset.com` 为 1.5 秒。

**配置项**（加到 `application.properties`）：

```properties
# Market valuation monitor (multpl / Yahoo / worldperatio / FactSet need no key; FRED reuses app.fred.api-key)
app.market-valuation.enabled=true
app.market-valuation.cron=0 30 6 * * *
app.market-valuation.price-history-start=1990-01-01
app.market-valuation.factset-history-start=2017-01-06
app.market-valuation.factset-max-per-run=60
app.market-valuation.stale-after=6h
app.market-valuation.read-timeout=60s
```

`enabled=false` 时，定时 / 补偿任务不执行（`StockClassifierApplicationTest` 的属性中加 `app.market-valuation.enabled=false`）；手动接口与 `refresh-if-stale` 不受影响。

### 5.5 计算（`MvCalcService`、`MvStatsService`、`MvDecompositionService`）

- `Map<String, List<SeriesPoint>> getSeries(Set<String> codes, LocalDate from, LocalDate to)`：
  - 原始 / 手动 code → 直接查库。
  - 派生 code → 先加载依赖序列再计算，最后裁剪到 `[from, to]`。依赖需要**向前多取**：
    - 锚点外推：锚点多取 400 天（季度锚点 + `SPX_EPS` 的滞后）。
    - `PX_W5000`、`GDP`：多取 1 年。
    - EPS 同比：多取 13 个月。
    - FactSet 修正：多取 100 天。
  - 未知 code → 400。
- 所有公式写成**纯静态函数**（输入 `List<SeriesPoint>` 等，输出 `List<SeriesPoint>`），不依赖数据库即可单测。核心函数：
  - `anchorScale(List<Anchor> anchors, List<SeriesPoint> prices, Kind kind)`，其中 `Anchor(date, value, AnchorPriceRule rule)`，`rule ∈ {MONTH_AVG, AS_OF_CLOSE}`，`Kind ∈ {PRICE_OVER_X, YIELD}`。
  - `asOfJoin(...)`、`sameDateJoin(...)`、`yoy(...)`、`zScore(...)`。
- `MvStatsService`：
  - `Stats windowStats(List<SeriesPoint> base, LocalDate end, Window w)` → `{ n, sampleStart, mean, sd, p10, p50, p90, min, max }`。
  - `double percentile(List<SeriesPoint> base, double current)`。
  - `List<SeriesPoint> resampleMonthEnd(List<SeriesPoint>)`：每个自然月取最后一个观测，日期记为该月最后一天。
  - `Temperature temperature(Window w)`（§3.4）。
- `MvDecompositionService`：实现 §3.5，返回各期限三种口径的 `{ total, valuation, earnings }`（百分数）及起止日期。

### 5.6 总览数据（`MvDashboardService`）

`GET /dashboard?window=20Y` 返回（数值仅为示意）：

```json
{
  "asOf": "2026-11-20",
  "window": "20Y",
  "temperature": { "value": 91.3, "level": "昂贵",
    "components": [ { "key": "CAPE", "code": "SPX_CAPE_D", "value": 36.44, "date": "2026-11-20",
                      "percentile": 96.2, "sampleStart": "2006-11-30", "n": 240, "excluded": false } ] },
  "cards": [ { "code": "ERP_REAL_D", "value": 0.71, "date": "2026-11-20", "prev": { "date": "2026-10-20", "value": 0.55 },
               "change": 0.16, "percentile": 3.1, "spark": [["2026-08-24", 0.62]], "stale": false, "estimate": true } ],
  "profitability": { "epsYoy": {}, "netMargin": {}, "roe": {}, "profitGdp": {},
                     "fsEpsGrowthQ": { "value": 32.9, "quarter": "Q3 2026", "date": "2026-11-20" },
                     "fsFwdEpsChg13w": {}, "fsEpsGrowthNextYear": {} },
  "quadrant": { "valuation": "昂贵", "earnings": "强", "text": "估值昂贵，但盈利高增长提供一定支撑" },
  "sources": [ { "source": "YAHOO", "lastSuccessAt": "2026-11-22T06:31:10", "lastStatus": "SUCCESS", "latestObsDate": "2026-11-20" } ],
  "fredConfigured": true,
  "syncRunning": false
}
```

- **卡片**（顺序即界面顺序）：
  - 估值：`SPX_CAPE_D`、`BUFFETT_D`、`SPX_PE_D`、`FS_FWD_PE`、`SPX_PS_D`、`SPX_DY_D`。
  - 相对估值：`ERP_REAL_D`、`ERP_NOM_D`、`ERP_FWD`、`TIPS10Y`。
  - 结构 / 情绪：`RSP_SPY`、`VIX`。
- `prev`：约 1 个月前的值（as-of `asOf − 30 天`）；`spark`：近 1 年的观测，**按周采样**（每周最后一个），最多 60 个点。
- `stale`：最新观测日期距今天超过该序列的 `typicalLagDays × 1.5`（见 catalog）。
- **盈利强弱**（用于象限）：优先用 `FS_EPS_G_NY`；没有则用 `SPX_EPS_YOY`。≥ 10% 为“强”，0–10% 为“温和”，< 0 为“下滑”。象限文案共 18 种（6 个温度档 × 3 个盈利档），以常量表形式写在代码里。

### 5.7 REST API（`/api/market-valuation`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/catalog` | 全部序列元数据：`code, name, unit, frequency, source, kind(RAW/DERIVED/MANUAL), group, direction(HIGHER_IS_EXPENSIVE/LOWER_IS_EXPENSIVE/NONE), typicalLagDays, estimate(是否为外推估算), description` |
| GET | `/dashboard?window=` | §5.6 |
| GET | `/series?codes=A,B&from=&to=&window=` | `{ "series": { "A": [["2026-11-20", 36.44], …] }, "stats": { "A": {n, sampleStart, mean, sd, p10, p50, p90} } }`。`stats` 只在传了 `window` 时返回，并基于该 code 的“分位基准序列”（§3.4；没有专门基准的用自身序列按月末重采样）计算。`from` 默认为 10 年前，codes 最多 12 个 |
| GET | `/markets?window=10Y` | 多市场表：每个市场 `{ market, name, scopeNote, date, pe, windows: { "1Y": {avg, sd, z, label}, … }, history: [[date, pe], …] }` |
| GET | `/decomposition` | §3.5 的结果 |
| GET | `/scatter/pb-roe` | `[{ date, roe, pb, era }]`：季末日期上 `SPX_ROE` 与 `SPX_PB` 都有值的点；最后追加一个最新点（`SPX_PB_D` 最新值 + 最新 `SPX_ROE`，`era = "LATEST"`） |
| POST | `/sync?mode=INCREMENTAL\|FULL&source=` | 202；已在运行 → 409；`source` 不支持 → 400 |
| POST | `/refresh-if-stale` | §5.4 |
| GET | `/sync/status` | `{ running, progress, lastLogs: [...] }`（最近 20 条） |
| GET | `/factset/reports?limit=30` | 周次簿记列表（倒序）+ `{ processedWeeks, totalWeeks }` |
| POST | `/factset/reports/{weekFriday}/retry` | 删除该周的簿记行，并对这一周触发一次 FACTSET 同步 |
| GET / POST | `/manual-series` | 列出 / 新建手动序列 |
| DELETE | `/manual-series/{code}` | 同时删除其全部观测（前端二次确认） |
| POST | `/manual-series/{code}/observations` | `{ date, value }` 或数组（批量），upsert |
| DELETE | `/manual-series/{code}/observations/{date}` | 删除单条 |

错误统一交给现有的 `GlobalExceptionHandler`：参数非法 → 400，资源不存在 → 404，同步冲突 → 409。

### 5.8 对现有代码的最小改动

1. **`pom.xml`**：新增 `org.apache.pdfbox:pdfbox`（3.0.x）。
2. **`HttpClientConfig`**：新增 `marketValuationRestTemplate` bean（§5.4）。
3. **`application.properties`**：新增 §5.4 的配置项。
4. **`StockClassifierApplicationTest`**：属性中加 `app.market-valuation.enabled=false`。
5. **`README.md`**：模块列表加一行；“外部数据源”部分加 multpl / Yahoo / worldperatio / FactSet 的说明（FRED 已存在）。
6. FRED Key **无需改动**：`/api/config` 已经支持。

---

## 6. 前端设计

### 6.1 路由与注册

- `app/modules.ts`：`ModuleId` 增加 `'market-valuation'`。
- `Root.tsx`：`const MarketValuationModule = lazy(() => import('./features/market-valuation/MarketValuationModule'));`，并加 `<Route path="/market-valuation" element={<ModuleRoute component={MarketValuationModule} />} />`。
- `HomePage.tsx`：在「宏观监测 / MACRO」分组的 `modules` 中，`liquidity` 之后追加本模块（§2 的名称、图标与描述）。
- `api.ts`：在文件末尾新增「Market Valuation APIs」分区，放本模块的类型与请求函数。

### 6.2 目录结构

```
frontend/src/features/market-valuation/
├── MarketValuationModule.tsx     # 外壳：头部（返回首页、刷新、同步状态、窗口选择器、复制给 AI）+ Tab 切换；挂载时调用 refresh-if-stale
├── mvQueries.ts                  # React Query hooks（queryKey 统一以 ['market-valuation', ...] 开头）
├── mvUtils.ts                    # 纯函数：格式化、分位着色、z 标签、时间范围、buildAiSummary
├── mvUtils.test.ts
├── charts/
│   ├── PbRoeScatterChart.tsx
│   ├── MarketRangeChart.tsx      # 多市场“当前 PE vs μ±σ / μ±2σ”区间图
│   └── DecompositionChart.tsx    # 回报拆解堆叠柱
├── tabs/
│   ├── OverviewTab.tsx
│   ├── ValuationTab.tsx
│   ├── MarketsTab.tsx
│   ├── ProfitabilityTab.tsx
│   └── SettingsTab.tsx
├── TemperatureBar.tsx            # 0–100 渐变条（纯 CSS，不用 ECharts gauge）
├── ValuationCard.tsx
└── MarketValuation.module.css    # 颜色一律使用现有主题 CSS 变量
```

**只读复用清单**（直接 import，不修改源文件）：

- `features/liquidity/charts/EChart.tsx`（主题适配、resize、dispose）
- `features/liquidity/charts/TimeSeriesChart.tsx`（多序列、左右轴、区间带 `area/helper`、`markLines`、`events`）
- `features/liquidity/charts/echartsCore.ts`（已注册 Line / Bar / Scatter + MarkLine / MarkArea / VisualMap 等，足够本模块使用，**不要再注册 gauge 等组件**）
- `features/liquidity/charts/chartPalette.ts`
- `features/liquidity/Sparkline.tsx`
- 市场事件区间接口 `/api/market-events/range`（流动性模块已新增）

### 6.3 Tab 1：总览（默认页）

- **顶部横幅**：
  - `TemperatureBar`：0–100，绿 → 红渐变，标出当前值与档位，例如“🌡️ 91 · 昂贵（20 年窗口）”。
  - 象限一句话：“估值昂贵，但盈利高增长提供一定支撑”。
  - “数据截至 YYYY-MM-DD”；各数据源的最新日期以小字显示，`stale` 的标黄。
- **温度分量表**：5 行，每行包括名称、当前值、分位条、样本起点、“样本不足”标记。
- **卡片网格**（`ValuationCard`）：名称、最新值 + 单位、较 1 个月前的变化、分位着色边框、迷你线、`估算` 角标（`estimate=true` 的派生序列）。
  - 第一行（绝对估值）：CAPE、巴菲特指标、TTM PE、远期 PE、PS、股息率
  - 第二行（相对估值）：实际 ERP、名义 ERP、远期 ERP、10 年 TIPS
  - 第三行（盈利能力）：EPS 同比、FactSet 当季 EPS 增速（标注季度）、下一年 EPS 增速、远期 EPS 13 周修正、净利率（标注数据日期）、利润 / GDP
  - 第四行（结构）：RSP/SPY、VIX
- 点击卡片 → 跳到“估值趋势”或“盈利能力”Tab，并预选该指标。
- 未配置 FRED Key → 依赖 FRED 的卡片显示占位“需要 FRED API Key → 去首页 ⚙ 设置”。
- 首次 FULL 回填进行中 → 显示“正在初始化历史数据（价格与 multpl 约 1–2 分钟；FactSet 历史会在后台逐步补齐）”。
- 窗口切换（头部）：`10Y / 20Y / 1990 至今 / 全部`，记在 `localStorage`（键名 `mv.window`）。

### 6.4 Tab 2：估值趋势

- **时间范围**：3Y / 5Y / 10Y / 20Y / 1990 至今 / 全部（全部只对月度 / 季度序列有意义）+ `dataZoom`。
- **预设面板**（每个面板一张 `TimeSeriesChart`）：
  1. **CAPE**：`SPX_CAPE_D`（日度）+ `SPX_CAPE`（月度，范围超过 20Y 时只画月度）。叠加当前窗口的均值线与 ±1σ 区间带（来自 `/series` 的 `stats`，用 `area/helper` 画带），以及 p90 参考线。
  2. **巴菲特指标**：`BUFFETT_D` + `BUFFETT_Q`（阶梯线），均值 / ±1σ 带。
  3. **TTM PE vs 远期 PE**：`SPX_PE_D`、`FS_FWD_PE`、`FS_FWD_PE_AVG5Y`、`FS_FWD_PE_AVG10Y`（虚线）。
  4. **PS / PB**：`SPX_PS_D`（左轴）、`SPX_PB_D`（右轴）。
  5. **股权风险溢价**：`ERP_REAL_D`、`ERP_NOM_D`、`ERP_FWD`，0 线；下方面板画 `SPX_CAPE_EY_D`、`TIPS10Y`、`UST10Y`。
  6. **托宾 Q**：`TOBIN_Q`（季度，参考）。
  7. **结构与情绪**：`RSP_SPY`（左）、`VIX`（右）。
- **自定义面板**：多选任意 code（最多 6 个，最多 2 种单位），与流动性模块的交互一致。
- **事件叠加开关**：调用 `/api/market-events/range`，默认关闭。

### 6.5 Tab 3：多市场对比

- **表格**：每行一个市场。列为：名称（附口径小字，CN / HK / JP 标注“市场级口径”）、日期、当前 PE、1Y / 5Y / 10Y / 20Y 的 z 分数（带标签着色）、近 1 年 PE 变化（历史不足 1 年时显示“积累中”）。
- **区间图**（`MarketRangeChart`）：横轴为市场，纵轴为 PE。每个市场画 μ−2σ ~ μ+2σ 的浅色柱、μ−σ ~ μ+σ 的深色柱（堆叠 bar，底部透明）、μ 的短横线（scatter）、当前 PE 的醒目点。窗口跟随头部选择器（1Y / 5Y / 10Y / 20Y 中最接近的一个，默认 10Y）。
- **历史线**：`WPE_{M}` 自上线起的积累曲线，可勾选市场。
- 底部说明：“worldperatio 口径为基于 ETF 的 TTM PE；中国 / 中国香港 / 日本为市场级口径，并非沪深 300 / 恒生 / 日经 225 本身。”

### 6.6 Tab 4：盈利能力

1. **EPS 与增速**：`SPX_EPS`（左轴）+ `SPX_EPS_YOY`（右轴，柱）；标注“报告口径，滞后约 1–2 个季度”。
2. **利润率与 ROE**：`SPX_NET_MARGIN`、`SPX_ROE`、`M_SPX_NET_MARGIN_FS`（如有）；标注 SPS / BVPS 的数据日期。
3. **宏观利润**：`PROFIT_GDP`。
4. **FactSet 每周**：`FS_EPS_G_Q`、`FS_REV_G_Q`（柱），`FS_EPS_G_NY`（线）；`FS_FWD_EPS`（左）+ `FS_FWD_EPS_CHG_13W`（右）。
5. **回报拆解**（`DecompositionChart`）：1Y / 3Y / 5Y / 10Y 四组堆叠柱（盈利贡献 vs 估值贡献，带总回报标签）。口径切换为 TTM / CAPE / 远期。
6. **PB–ROE 散点**（`PbRoeScatterChart`）：
   - X = ROE（%），Y = PB；按时期分色：`2000–2008` 灰、`2009–2019` 浅蓝、`2020 至今` 深蓝。时期边界写成常量数组。
   - 最新点放大并标注日期，从上一季度画连线指向它。
   - 参考线：等 PE 直线 `PB = PE × ROE / 100`，PE = 15 / 20 / 25 / 30（用 line series 画两点直线）。
   - 图下注明：“PB / PE = ROE；美股大量回购压缩净资产，PB 与 ROE 会被同时抬高”。

### 6.7 Tab 5：设置

- **数据同步**：【增量同步】【全量重建历史】（二次确认）、按数据源单独同步的下拉菜单、运行状态与进度、最近 20 条日志表（数据源、模式、区间、状态、行数、耗时、信息）。
- **FactSet 周报簿记**：最近 30 周的列表（周五日期、文件名、状态、季度、缺失字段），`PARSE_FAILED` / `NOT_FOUND` 行有【重试】按钮；显示历史回填进度“已处理 X / 共 Y 周”。
- **手动序列**：新建（校验 `M_` 前缀）、录入（单条，或粘贴多行 `YYYY-MM-DD,数值`）、最近 20 条、删除；§3.3 的预置序列各有一个快捷按钮。
- FRED Key 未配置时，页面顶部提示“去首页 ⚙ 设置”。

### 6.8 复制给 AI 的摘要

头部按钮【📋 复制给 AI】。`mvUtils.buildAiSummary(dashboard, markets, decomposition, catalog)` 生成 Markdown，并用 `navigator.clipboard.writeText` 复制，`useToast` 提示“已复制”。另提供【下载 .md】按钮，文件名为 `美股估值摘要-YYYY-MM-DD.md`。格式（需单测）：

```markdown
# 美股估值与盈利快照（数据截至 2026-11-20）

> 估值温度：91 / 100（昂贵；分位窗口 20 年）｜象限：估值昂贵，但盈利高增长提供一定支撑
> 说明：带“估”的为按最新价格外推的日度估算；分位 = 当前值在窗口内历史数据中的百分位。

## 绝对估值（标普 500）
| 指标 | 当前 | 数据日期 | 1 个月前 | 20 年分位 | 备注 |
|---|---|---|---|---|---|
| CAPE | 36.4（估） | 2026-11-20 | 39.8 | 96% | multpl 月度 + 日度外推 |
| ... | | | | | |

## 相对估值
...
## 盈利能力
...（每行附数据日期；滞后严重的数据加 ⚠️）
## 多市场 PE（相对 10 年均值）
| 市场 | PE | 10 年均值 | z | 标签 | 口径 |
...
## 回报拆解（TTM 口径）
| 期限 | 总回报 | 盈利贡献 | 估值贡献 |
...
## 口径与局限
- worldperatio / multpl / FactSet 的 PE 口径不同，不可直接比较数值。
- 巴菲特指标的日度值由 Z.1 季度市值按 Wilshire 5000 外推。
- 净利率与 ROE 基于 multpl 每股销售额 / 净资产，最新只到 2025-09。

## 请你分析
1. 从价值投资角度，当前美股整体估值处于什么位置？主要由哪些指标驱动？
2. 盈利增长能否消化当前估值？需要关注哪些风险信号？
3. 与中国、中国香港、日本市场相比，美股的相对吸引力如何？
```

- “口径与局限”中的日期（如“最新只到 2025-09”）由数据动态生成，不要写死。
- 缺失的数据行（例如未配置 FRED）输出“—（未配置 FRED Key）”，不要省略整行。

### 6.9 数据获取与交互

- React Query：`/dashboard` 的 `staleTime` 为 10 分钟；`/series` 以 `['market-valuation', 'series', codes, from, to, window]` 为 key。
- 挂载时调用 `refresh-if-stale`；返回 `triggered: true` 或同步进行中时，每 2 秒轮询 `/sync/status`；结束后 `invalidateQueries({ queryKey: ['market-valuation'] })` 并用 `useToast` 提示。
- 删除类操作用 `useConfirm`；错误信息用 `getErrorMessage`。
- 格式化：倍数保留 1–2 位小数并加 `x`；% 保留 2 位；ERP 等差值带正负号；指数点位使用千分位。

---

## 7. 关键边界情况

| 情况 | 处理 |
|---|---|
| multpl 未来日期行（如 `Nov 30, 2026`） | 丢弃（§3.1.1） |
| multpl 首行的日期恰好符合日期约定（例如 12-01 是交易日） | 按普通月度行处理（锚点价格 = 当月均价 = 当日收盘），结果等价 |
| 锚点所在月没有 `PX_SPX` 价格（1990 年以前） | 丢弃该锚点；日度序列从 1990 年起 |
| Yahoo 返回 `null` 收盘价 / 盘中未完成 K 线 | 跳过 / 照常写入并在下次覆盖 |
| worldperatio 某市场页面变化 | 该市场失败，数据源记 `PARTIAL`，其他市场照常 |
| FactSet 某周 404 | `NOT_FOUND`；最近 3 周内会重试 |
| FactSet 句式变化导致远期 PE 解析失败 | `PARSE_FAILED`，保留文件名，设置页可重试；用户也可以在手动序列中补录 |
| FactSet 增速为“decline” | §4.4 的符号规则 |
| 没有 FRED Key | FRED 记 SKIPPED；巴菲特 / ERP / 托宾 Q / 利润占 GDP 返回空数组，前端引导配置 |
| `TNWMVBSNNCB` 不存在 | 只影响 `TOBIN_Q`；在交付说明中列出 |
| 某个温度分量样本不足 | 不计入温度，界面标注 |
| 同步并发 | `AtomicBoolean` 互斥，第二个请求返回 409；`refresh-if-stale` 遇到运行中的同步返回 `triggered: false` |
| 数据滞后（EPS / SPS / BVPS / Z.1） | 一律显示“数据日期”，不伪装成最新；超过 `typicalLagDays × 1.5` 标黄 |
| 节假日 / 周末 | 不插值；图表 x 轴使用 `type: 'time'` |

---

## 8. 安全与运维

- 不新增任何对外监听端口。外部请求只发往固定主机：`www.multpl.com`、`query1.finance.yahoo.com`、`worldperatio.com`、`advantage.factset.com`、`api.stlouisfed.org`。URL 只由代码常量、枚举（市场、symbol、FRED ID）和日期拼接，**不拼接用户输入**（防 SSRF；手动序列的 code 永远不会进入外部 URL）。
- 日志和 `mv_fetch_log.message` 中不得出现 `api_key` 明文（在 `MvHttp` 中实现与 `LiquidityHttp.redact` 相同的脱敏正则）。
- **爬取礼仪**：每天只同步一次（加上按需刷新，最多每 6 小时一次）；按主机节流；FactSet 历史回填分批进行；HTML / PDF 只在内存中解析，不落盘。
- 现有的 `DatabaseBackupService` 会自动覆盖新表，无需改动。
- 第三方站点（multpl、worldperatio、FactSet PDF、Yahoo 非官方接口）可能改版或限流：每个数据源失败互不影响，设置页能看到原因。

---

## 9. 测试计划

### 9.1 后端（JUnit 5，`mvn test`，不访问网络）

Fixture 放在 `backend/src/test/resources/market-valuation/`（附录 A）。

| 测试类 | 覆盖内容 |
|---|---|
| `MultplClientTest` | 解析月初表（含首行 SPOT 拆分）、月末表（`%`、`†` → estimate、未来日期丢弃）、季末表（千分位逗号）；日期约定判定；合理性检查丢弃异常行；空表 → 异常 |
| `YahooClientTest` | 时间戳按交易所时区转日期；`null` 跳过；`adjclose` 与 `close` 的选择；`chart.error` → 异常 |
| `WorldPeClientTest` | 当前 PE + 日期；1/5/10/20Y 的 μ 与 σ（σ = 上沿 − μ）；缺少某个 N 时只写已有的；页面无数据 → 失败 |
| `FactsetClientTest` | 用附录 A.4 的三段文本：2017（`positive EPS surprises` 复数，无 CY 句）、2020（`earnings decline ... is -6.3%` 不二次取负）、2026（全部字段）；CY 年份过滤；`below` 时目标价涨幅取负；候选文件名生成（周五 / 周五 A / 周四 / 周四 A，`MMddyy`）；`PARSE_FAILED` 判定 |
| `MvFredClientTest` | Z.1 序列季初 → 季末；GDP / CPATAX 保持季初；Millions → bn |
| `MvCalcServiceTest` | `anchorScale`：月均价锚点、as-of 收盘锚点、SPOT 覆盖月度锚点、收益率类反向计算、锚点之前不产出；`BUFFETT_Q` / `BUFFETT_D`（W5000 外推 + GDP as-of）；ERP 同日连接；`SPX_EPS_YOY`；净利率 / ROE 季末对齐；`FS_FWD_EPS` 与 13 周修正；z 分数 |
| `MvStatsServiceTest` | 分位（含相等值的 0.5 计数）、窗口裁剪与 `sampleStart`、月末重采样、样本不足排除、温度平均与“越低越贵”取反、档位边界（恰好 20 / 40 / 60 / 80 / 95） |
| `MvDecompositionServiceTest` | 总回报 = 估值贡献 + 盈利贡献（对数恒等，误差 < 1e-9）；百分数换算；远期口径数据不足时省略 |
| `MvSyncServiceTest` | 模拟客户端：upsert 幂等；单个数据源失败不影响其他；并发 409；增量起点；`refresh-if-stale` 的三种分支；FactSet 簿记（`NOT_FOUND` 只在最近 3 周重试、每次处理上限） |

**`anchorScale` 的最小数值用例**（建议直接写进测试）：

- 价格：`2026-10-01..10-31` 每个交易日 100，`2026-11-02` 110，`2026-11-20` 120；锚点：`SPX_CAPE 2026-10-01 = 40`（MONTH_AVG），`SPX_CAPE_SPOT 2026-11-20 = 36`（AS_OF_CLOSE）。
- 期望：10 月各日 = 40；11-02 = 110 / (100 / 40) = 44；11-20 = 36（SPOT 生效，F = 120 / 36）；若 11-23 价格为 126，则 11-23 = 126 / (120 / 36) = 37.8。

### 9.2 前端（Vitest）

- `mvUtils.test.ts`：数值格式化、分位着色、z 标签边界、窗口 → 日期范围、`buildAiSummary` 的输出（含 FRED 缺失、样本不足、滞后 ⚠️ 等分支）。
- 不要求对图表组件做渲染测试。

### 9.3 手动验收

1. 首次启动（`mv_` 表为空）→ 约 2 分钟后自动 FULL。设置页日志显示 YAHOO / MULTPL / WPR 成功，FRED 成功（或在未配置 Key 时 SKIPPED），FACTSET 开始渐进回填（第一批 60 周）。
2. 总览：CAPE 约 36.4（2026-11-20）、TTM PE 约 23.5、远期 PE 17.1、worldperatio 纳指 100 为 26.37（与附录一致，允许新数据导致的变化）；温度计与分量能显示。
3. 估值趋势选“全部”：CAPE 可以看到 1929、2000 年的高点；巴菲特指标从 1947 年起。
4. 多市场：7 个市场都有 z 分数；CN / HK / JP 显示“市场级口径”。
5. 盈利能力：回报拆解三种口径能切换；PB–ROE 散点的最新点有标注。
6. 【复制给 AI】→ 粘贴出的 Markdown 与页面数值一致。
7. 打开模块时，若距上次成功同步超过 6 小时 → 自动刷新并提示；6 小时内再次打开 → 不触发。
8. 切换主题后图表配色跟随；打开其他模块时不加载 echarts chunk。

---

## 10. 交付阶段

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P1 数据层** | V6 迁移、实体 / 仓库、`MvHttp`、5 个 Client（含 PDFBox）、同步服务（手动 + 定时 + 补偿 + 按需刷新 + 启动恢复）、`/sync*`、`/refresh-if-stale`、`/series`（仅原始序列）、`/catalog`、`/factset/reports*` | 后端单测通过；手动调用接口能拉到各数据源的数据 |
| **P2 计算 + 总览** | `MvCalcService`、`MvStatsService`、`/dashboard`、`/series` 的派生序列与 `stats`；前端模块注册、首页入口、总览 Tab、温度计、复制给 AI | 前后端测试 + lint + build 通过；手动验收 1、2、6、7 |
| **P3 趋势 + 多市场 + 盈利** | 估值趋势 Tab、多市场 Tab（`/markets`）、盈利能力 Tab（`/decomposition`、`/scatter/pb-roe`） | 手动验收 3、4、5、8 |
| **P4 设置 + 收尾** | 设置 Tab（同步、日志、FactSet 簿记与重试、手动序列）、README 更新 | 全部手动验收 |

---

## 11. 校验命令

```powershell
cd backend;  mvn test
cd frontend; npm run lint; npm test; npm run build
```

---

## 12. 待确认 / 后续可扩展

1. **沪深 300 官方 PE**：中证指数官网可以访问（实测 `https://www.csindex.com.cn/csindex-home/perf/index-perf-oneday?indexCode=000300` 返回 JSON；`https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/indicator/000300indicator.xls` 是含 PE / 股息率的近期 xls）。需要引入 Excel 解析依赖，本期**不实现**。
2. 恒生 / 日经官方 PE：本机实测 `indexes.nikkei.co.jp` 返回 403，恒生官网接口返回 404，本期不实现。
3. Shiller 原始数据 `http://www.econ.yale.edu/~shiller/data/ie_data.xls` 可以访问（约 1.6MB），可作为 multpl 失效时 CAPE 的备份来源（需要 Excel 解析）。
4. S&P DJI 官方的 `sp-500-eps-est.xlsx`（含经营 EPS、利润率、回购）在本机返回 **403**；GuruFocus 返回 403，均不可用。
5. 可扩展：保证金债务（FINRA）、标普 500 前 10 大成分股权重集中度、行业层面的远期 PE（FactSet PDF 中有表格）、按温度档位的推送通知。

---

## 附录 A：实测响应样例（作为单测 fixture，放在 `backend/src/test/resources/market-valuation/`）

**A.1 `multpl-shiller-pe.html`**（`/shiller-pe/table/by-month`，2026-11-21 实测，已截断；月初约定）

```html
<table id="datatable">
<tr>
<th>Date</th>
<th>Value</th>
</tr>
<tr class="odd">
<td>Nov 20, 2026</td>
<td>
&#x2002;
36.44
</td>
</tr>
<tr class="even">
<td>Nov 1, 2026</td>
<td>
&#x2002;
39.82
</td>
</tr>
<tr class="odd">
<td>Oct 1, 2026</td>
<td>
&#x2002;
40.60
</td>
</tr>
</table>
```

期望：`SPX_CAPE_SPOT` 2026-11-20 = 36.44（estimate）；`SPX_CAPE` 2026-11-01 = 39.82，2026-10-01 = 40.60。

**A.1b `multpl-dividend-yield.html`**（月末约定，含 † 与未来日期）

```html
<table id="datatable">
<tr><th>Date</th><th>Value</th></tr>
<tr class="odd"><td>Nov 20, 2026</td><td>
<abbr title="Estimate">†</abbr>
1.17%
</td></tr>
<tr class="even"><td>Nov 30, 2026</td><td>
<abbr title="Estimate">†</abbr>
1.08%
</td></tr>
<tr class="odd"><td>Oct 31, 2026</td><td>
<abbr title="Estimate">†</abbr>
1.06%
</td></tr>
<tr class="even"><td>Jun 30, 2026</td><td>
&#x2002;
1.10%
</td></tr>
</table>
```

期望（今天 = 2026-11-22）：`SPX_DY_SPOT` 2026-11-20 = 1.17（estimate）；2026-11-30 行丢弃；`SPX_DY` 2026-10-31 = 1.06（estimate），2026-06-30 = 1.10（非 estimate）。

**A.1c `multpl-sales.html`**（季末约定，千分位逗号）：`<tr class="odd"><td>Sep 30, 2025</td><td>&#x2002;2,042.16</td></tr>` → `SPX_SPS` 2025-09-30 = 2042.16。

**A.2 `yahoo-chart-gspc.json`**（`/v8/finance/chart/%5EGSPC?range=5d&interval=1d`，2026-11-21 实测，已截断）

```json
{"chart":{"result":[{"meta":{"currency":"USD","symbol":"^GSPC","exchangeTimezoneName":"America/New_York",
 "regularMarketPrice":6910.39,"regularMarketTime":1795210554},
 "timestamp":[1794839400,1794925800,1795012200,1795098600,1795185000],
 "indicators":{"quote":[{"close":[7416.58984375,7340.52978515625,7323.6298828125,7175.830078125,6910.39013671875]}],
               "adjclose":[{"adjclose":[7416.58984375,7340.52978515625,7323.6298828125,7175.830078125,6910.39013671875]}]}}],
 "error":null}}
```

期望：2026-11-16 … 2026-11-20 五个交易日；2026-11-19 = 7175.83，2026-11-20 = 6910.39。另准备一份把其中一个 `close` 改成 `null` 的变体。

**A.3 `worldperatio-nasdaq-100.txt`**（已去标签、折叠空白后的文本片段；测试时也应准备一份带 `<script>` / 标签的原始 HTML 片段）

```text
Nasdaq 100 Index P/E Ratio 26.37 20 November 2026 The estimated Price-to-Earnings (P/E) Ratio for Nasdaq 100 Index is 26.37 , calculated on 20 November 2026 . Considering the last 5 years, an average P/E interval is [27.42 , 33.43]. ... · P/E Ratio: 26.37 · 1Y Average: 32.14 · 1 Std Dev range: [30.60 , 33.68] · 2 Std Dev range: [29.06 , 35.23] 20 November 2026 · P/E Ratio: 26.37 · 5Y Average: 30.43 · 1 Std Dev range: [27.42 , 33.43] · 2 Std Dev range: [24.42 , 36.44] 20 November 2026 · P/E Ratio: 26.37 · 10Y Average: 27.51 · 1 Std Dev range: [23.56 , 31.46] · 2 Std Dev range: [19.61 , 35.41] 20 November 2026 · P/E Ratio: 26.37 · 20Y Average: 22.66 · 1 Std Dev range: [17.10 , 28.22] · 2 Std Dev range: [11.54 , 33.79]
```

期望：`WPE_NDX` 2026-11-20 = 26.37；`WPE_NDX_AVG10Y` = 27.51，`WPE_NDX_SD10Y` = 3.95；`WPE_NDX_Z10Y` ≈ −0.29 → “合理”。

其他市场的实测值（2026-11-20，10Y μ [μ−σ, μ+σ]）：SPX 22.55（20.61 [17.16, 24.06]）、DJI 19.23（20.88 [18.32, 23.45]）、RUT 15.27（16.34 [14.73, 17.96]）、CN 8.16（11.05 [9.64, 12.45]）、HK 12.17（15.41 [14.35, 16.47]）、JP 14.31（14.65 [13.10, 16.21]）。

**A.4 `factset-*.txt`**（用 PDF 文本提取并规范化空白后的片段）

`factset-2026-11-20.txt`：

```text
EARNINGS INSIGHT November 20, 2026 ... Key Metrics * Earnings Scorecard: For Q3 2026 (with 93% of S&P 500 companies reporting actual results), 84% of S&P 500 companies have reported a positive EPS surprise and 74% of S&P 500 companies has reported a positive revenue surprise. * Earnings Growth: For Q3 2026, the blended (year-over-year) earnings growth rate for the S&P 500 is 32.9%. If 32.9% is the actual growth rate for the quarter, it will mark the third-straight quarter of earnings growth above 25% for the index. * Valuation: The forward 12-month P/E ratio for the S&P 500 is 17.1. This P/E ratio is below the 5-year average (19.8) and below the 10-year average (19.1). ... As a result, the blended revenue growth rate for the third quarter is 14.6% today, compared to a revenue growth rate of 14.4% last week ... For CY 2027, analysts are projecting earnings growth of 16.4% and revenue growth of 10.0%. ... The trailing 12-month P/E ratio is 22.9, which is below the 5-year average of 24.4 and below the 10-year average of 23.7. Targets & Ratings: Analysts Project 27% Increase in Price Over Next 12 Months The bottom-up target price for the S&P 500 is 9,099.54, which is 26.8% above the closing price of 7,175.83.
```

期望：`FS_FWD_PE` 17.1、`FS_FWD_PE_AVG5Y` 19.8、`FS_FWD_PE_AVG10Y` 19.1、`FS_TTM_PE` 22.9、`FS_EPS_G_Q` 32.9（季度 `Q3 2026`）、`FS_REV_G_Q` 14.6、`FS_BEAT_EPS` 84、`FS_EPS_G_NY` 16.4、`FS_REV_G_NY` 10.0、`FS_TARGET` 9099.54、`FS_CLOSE` 7175.83；`FS_FWD_EPS` = 7175.83 / 17.1 ≈ 419.64。

`factset-2020-11-20.txt`：

```text
Earnings Scorecard: For Q3 2020 (with 95% of the companies in the S&P 500 reporting actual results), 84% of S&P 500 companies have reported a positive EPS surprise and 78% have reported a positive revenue surprise. * Earnings Growth: For Q3 2020, the blended earnings decline for the S&P 500 is -6.3%. If -6.3% is the actual decline for the quarter, ... * Valuation: The forward 12-month P/E ratio for the S&P 500 is 21.7. This P/E ratio is above the 5-year average (17.4) and above the 10-year average (15.6).
```

期望：`FS_EPS_G_Q` = −6.3（不得变成 +6.3），`FS_FWD_PE` 21.7 / 17.4 / 15.6，`FS_BEAT_EPS` 84。

`factset-2017-11-17.txt`：

```text
Earnings Scorecard: For Q3 2017 (with 95% of the companies in the S&P 500 reporting actual results for the quarter), 74% of S&P 500 companies have reported positive EPS surprises and 66% have reported positive sales surprises. * Earnings Growth: For Q3 2017, the blended earnings growth rate for the S&P 500 is 6.2%. ... * Valuation: The forward 12-month P/E ratio for the S&P 500 is 18.0. This P/E ratio is above the 5-year average (15.7) and above the 10-year average (14.1).
```

期望：`FS_BEAT_EPS` 74、`FS_EPS_G_Q` 6.2、`FS_FWD_PE` 18.0 / 15.7 / 14.1；没有 CY / 目标价句子 → 状态仍为 `PARSED`，`message` 列出缺失字段。

**A.5 `fred-observations-quarterly.json`**（结构同流动性模块；实现时可以用真实响应替换）

```json
{ "observations": [
  { "date": "2026-01-01", "value": "52000000.0" },
  { "date": "2026-04-01", "value": "." }
] }
```

配合 `units = "Millions of Dollars"`：期望 `EQ_NONFIN` 2026-03-31 = 52000.0 bn；`"."` 跳过。

---

## 附录 B：指标 → 问题对照（来自需求讨论）

| 讨论要点 | 本模块的处理 |
|---|---|
| CAPE 剔除盈利周期，但对会计准则变化、行业结构迁移不敏感，容易“长期高估” | CAPE 作为温度分量；分位窗口可切换（10Y / 20Y / 1990 / 全部） |
| 巴菲特指标忽略海外营收占比和估值中枢的抬升 | 作为温度分量；用 Z.1 官方口径 + W5000 外推；同样受窗口切换影响 |
| ERP 高度依赖利率；高通胀时静态 1/PE 失真 | 以**实际 ERP**（1/CAPE − TIPS）为主，名义 / 远期 ERP 作参照 |
| PB 对轻资产公司失真 | PB 不计入温度，只在趋势图与 PB–ROE 散点中作参考 |
| 股东总回报 = 股息率 + 净回购率 | 股息率自动获取；回购收益率用手动序列 `M_SPX_BUYBACK_YIELD` |
| 托宾 Q 统计滞后、无形资产难以估计 | 季度参考指标，不计入温度 |
| PB = PE × ROE | ROE 季度序列 + PB–ROE 散点 + 等 PE 参考线 |
| ROIC − WACC、杜邦拆解 | 指数层面没有免费数据，本期不做（可用手动序列记录） |
| 净利率处于历史高位（如 2026Q3 的 14.9%） | multpl 推导的净利率（滞后）+ FactSet 口径的手动序列 |
| 回购使 EPS 增速 > 净利润增速 | 盈利 Tab 同时展示 EPS 增速与宏观利润（CPATAX / GDP）以作对照 |
| 警惕周期顶点的“伪低估” | CAPE（10 年平滑）与 TTM / 远期 PE 并列；回报拆解给出“CAPE 口径” |
| 均值回归需要结构不变 | 多窗口分位 + AI 摘要中的“口径与局限”段落 |
