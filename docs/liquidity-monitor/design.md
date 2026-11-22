# 美元流动性监测（Liquidity Monitor）设计文档

> 版本：v1.0（2026-11-22）
> 状态：待实现
> 读者：实现者（Sonnet）与项目所有者
> 背景材料：鸿学院微课堂 410 期（2026-11-14）第三节「美元流动性“新梗阻”」（24:45–43:37）与第九节「美元环流周报」（01:48:58–01:56:32），以及其中引用的高盛 Isabella Rosenberg 2026-11-10 报告 *Exhibit 5*。

---

## 0. 实现者须知（先读这一节）

1. **只做本文档描述的内容**，不要顺手重构其他模块。遇到文档未覆盖的细节，选最简单、与现有代码风格一致的做法，并在交付说明中列出。
2. 后端 schema 由 **Flyway** 管理，`spring.jpa.hibernate.ddl-auto=validate`：新增实体**必须**同时新增 `V4__liquidity_monitor.sql`，列类型需与实体严格一致，否则启动失败。
3. 所有外部接口地址、字段名、口径陷阱都已在本机实测（见 §4 与附录 A），**不要凭记忆改用其他接口**。
4. 测试**不得访问真实网络**：解析器用附录 A 的样例 JSON 作为 fixture。
5. 按 §10 的阶段顺序交付，每个阶段结束都要跑通 §11 的校验命令。

---

## 1. 目标与非目标

### 1.1 目标

把「美元环流」框架里的关键指标做成一个**可自动更新、可回看历史、可出周报**的模块，用来回答：

- **批发资金市场（回购市场 = “新发地”）是否出现梗阻？** → SOFR/TGCR 相对 IORB、EFFR 的利差。
- **系统准备金离“悬崖”还有多远？** → (准备金 + ON RRP) / 商业银行总资产，对照高盛的 11% / 14% 阈值。
- **缓冲垫和“水龙头”的状态？** → ON RRP 余额、TGA、SRF 用量、美联储储备管理购买（RMP，购买短债）。
- **风险是否传导到信用端？** → 高收益债利差（免费）+ 手动录入的 AI 公司 CDS（如甲骨文）。

### 1.2 非目标

- 不做盘中实时行情（数据源本身是 T+1 日度 / 周度发布）。
- 不做自动交易信号、不做推送通知（后续可扩展）。
- 不抓取付费数据（CDS 只支持手动录入）。
- 不改造现有模块（唯一例外见 §5.8：`/api/config` 增加 FRED Key、`/api/market-events` 增加区间查询）。

---

## 2. 命名与入口

| 项 | 值 |
|---|---|
| 中文名 | **美元流动性监测** |
| 英文标签 | `LIQUIDITY MONITOR` |
| ModuleId / 路由 | `liquidity` → `/liquidity` |
| 首页分组 | 新增分组「宏观监测 / MACRO」，放在「研究工具」之后 |
| 图标 | `💧` |
| 首页描述 | 追踪 SOFR、IORB、准备金、逆回购、TGA 等美元流动性指标，生成趋势图与周报 |
| 后端 API 前缀 | `/api/liquidity` |

---

## 3. 指标体系

### 3.1 原始序列（从外部拉取并入库）

单位约定：**利率用 %（百分数）**，**金额统一换算成十亿美元（bn）**，利差用**基点（bp）**。

| code | 名称 | 单位 | 频率 | 数据源 | 取值方式 | 历史起点 |
|---|---|---|---|---|---|---|
| `SOFR` | 有担保隔夜融资利率 | % | 日 | NYFED rates | `type=SOFR` 的 `percentRate` | 2018-04-02 |
| `SOFR_P1` / `SOFR_P25` / `SOFR_P75` / `SOFR_P99` | SOFR 分位数 | % | 日 | NYFED rates | `percentPercentile1/25/75/99` | 2018-04-02 |
| `SOFR_VOL` | SOFR 成交量 | bn | 日 | NYFED rates | `volumeInBillions` | 2018-04-02 |
| `TGCR` | 三方回购利率 | % | 日 | NYFED rates | `type=TGCR` 的 `percentRate` | 2018-04-02 |
| `TGCR_P99` | TGCR 99 分位 | % | 日 | NYFED rates | `percentPercentile99` | 2018-04-02 |
| `TGCR_VOL` | TGCR 成交量 | bn | 日 | NYFED rates | `volumeInBillions` | 2018-04-02 |
| `BGCR` | 广义一般担保利率 | % | 日 | NYFED rates | `type=BGCR` 的 `percentRate` | 2018-04-02 |
| `EFFR` | 联邦基金有效利率 | % | 日 | NYFED rates | `type=EFFR` 的 `percentRate` | 2018-04-01* |
| `EFFR_VOL` | EFFR 成交量 | bn | 日 | NYFED rates | `volumeInBillions` | 同上 |
| `FFTR_LOW` / `FFTR_HIGH` | 联邦基金目标区间下限 / 上限 | % | 日 | NYFED rates | EFFR 记录里的 `targetRateFrom` / `targetRateTo` | 同上 |
| `ONRRP_AMT` | 隔夜逆回购用量 | bn | 日 | NYFED repo | 同一 `operationDate` 内 `operationType=="Reverse Repo"` 的 `totalAmtAccepted` 求和 ÷ 1e9 | 2018-04-01 |
| `ONRRP_RATE` | 逆回购中标利率（利率走廊下沿） | % | 日 | NYFED repo | 上述记录 `details[0].percentAwardRate` | 2018-04-01 |
| `SRF_AMT` | 美联储回购操作用量（2021-07 起即 SRF） | bn | 日 | NYFED repo | 同一 `operationDate` 内 `operationType=="Repo"` 的 `totalAmtAccepted` 求和 ÷ 1e9 | 2018-04-01 |
| `SRF_RATE` | SRF 最低报价利率（利率走廊上沿） | % | 日 | NYFED repo | `operationType=="Repo"` 记录 `details[*].percentOfferingRate` 的最小值；没有时不写入 | 2021-07-28 起有意义 |
| `RMP_BILLS` | 美联储购买短期国债（含 RMP） | bn | 日（有操作才有值） | NYFED tsy | `operationDirection=="P"` 且 `operationType` 含 `"Bill"`，按 `operationDate` 对 `totalParAmtAccepted` 求和 ÷ 1e9（注意它是**字符串**） | 2018-04-01 |
| `TGA` | 财政部一般账户余额 | bn | 日 | Treasury DTS | 见 §4.3 口径（原始单位：百万美元，需 ÷ 1000） | 2018-04-01 |
| `IORB` | 准备金利率（2021-07-29 前为 IOER，合并为一条序列） | % | 日 | FRED | `IOER`（≤ 2021-07-28）+ `IORB`（≥ 2021-07-29） | 2018-04-01 |
| `RESERVES` | 准备金余额（周均） | bn | 周（周三） | FRED | `WRESBAL` | 2018-04-01 |
| `BANK_ASSETS` | 全部商业银行总资产（季调） | bn | 周（周三） | FRED | `TLAACBW027SBOG` | 2018-04-01 |
| `FED_ASSETS` | 美联储总资产 | bn | 周（周三） | FRED | `WALCL` | 2018-04-01 |
| `HY_OAS` | 美国高收益债期权调整利差 | % | 日 | FRED | `BAMLH0A0HYM2`（FRED 对 ICE 数据只提供近几年历史，拿到多少存多少） | 尽量 |

\* NYFED 的历史起点以实际返回为准；回填起点统一为配置项 `app.liquidity.history-start=2018-04-01`。

**FRED 单位换算**：不要硬编码单位。首次拉某个 FRED 序列时调用 `GET /fred/series?series_id=...` 读 `units` 字段：含 `Millions` 的 ÷ 1000，含 `Billions` 的原样保留，`Percent` 原样保留。FRED 的缺失值是字符串 `"."`，直接跳过。

### 3.2 派生序列（读取时计算，不入库）

| code | 名称 | 单位 | 公式 | 含义（来自课程） |
|---|---|---|---|---|
| `SOFR_IORB` | SOFR − IORB | bp | (SOFR − IORB) × 100 | **核心警报**。正常应为负（约 −2 ~ −5bp）；> 0 表示银行宁可把钱放在准备金账户也不去回购市场做无风险套利 → 交易对手风险 / 抵押品风险上升 → “新发地”梗阻 |
| `TGCR_IORB` | TGCR − IORB | bp | (TGCR − IORB) × 100 | 高盛 Exhibit 5 的纵轴 |
| `SOFR_EFFR` | SOFR − EFFR | bp | (SOFR − EFFR) × 100 | 周报必看。有担保利率理应比无担保低约 2bp，持平即异常 |
| `SOFR99_IORB` | SOFR 99 分位 − IORB | bp | (SOFR_P99 − IORB) × 100 | 尾部压力，通常比 SOFR 中位数更早报警 |
| `EFFR_IORB` | EFFR − IORB | bp | (EFFR − IORB) × 100 | 准备金充裕度的辅助指标 |
| `SOFR_RRP` | SOFR − 逆回购利率 | bp | (SOFR − ONRRP_RATE) × 100 | SOFR 在利率走廊中的位置 |
| `RES_PLUS_RRP` | 准备金 + 逆回购 | bn | RESERVES + 当周（周四至周三）ONRRP_AMT 均值 | 高盛口径的分子 |
| `LIQ_RATIO` | (准备金 + 逆回购) / 银行总资产 | % | RES_PLUS_RRP ÷ BANK_ASSETS × 100，按周三对齐 | **高盛 Exhibit 5 的横轴**；11% 是悬崖边缘，2025 年紧张时为 14% |
| `RMP_MONTHLY` | 月度短债购买额 | bn | 按自然月对 RMP_BILLS 求和，日期记为当月最后一天 | 对照高盛预测（11 月起约 100 亿美元/月，4 月起约 250 亿美元/月） |

**对齐规则（必须实现并有单测）**

- IORB 是“阶梯型”序列：计算利差时对 IORB 做 **as-of 连接**（取 ≤ 当日的最近一个值），不要求同一天正好有 IORB 观测。
- 其余日度利差只在**两个原始序列都有当日观测**的日期上产出（节假日不补值）。
- `LIQ_RATIO` 只在 RESERVES 与 BANK_ASSETS 都有的周三产出；ONRRP 取该周三所在周（周四至周三）日度值的均值，没有日度值时按 0 计。
- 高盛原图横轴用的是“周内最小值”。我们的周度准备金只有周均值，所以**这里是近似复刻**，界面上要注明“近似口径”。

### 3.3 手动序列

用于 CDS 这类没有免费接口的数据。用户可以在界面上新建手动序列（code、名称、单位、说明），再逐条录入 `(日期, 数值)`。手动序列和原始序列共用同一张观测表，在图表与周报中一视同仁。

预置建议（不自动创建，在界面上给出“一键添加”按钮即可）：`CDS_ORCL_5Y`（甲骨文 5 年期 CDS，bp）。

### 3.4 状态灯与默认阈值

每个可评估的指标有一条阈值规则：`direction`（`HIGHER_IS_WORSE` / `LOWER_IS_WORSE`）、`yellow`、`red`、`enabled`。评估使用**最新值**：

- `HIGHER_IS_WORSE`：值 ≥ red → 红；≥ yellow → 黄；否则绿。
- `LOWER_IS_WORSE`：值 ≤ red → 红；≤ yellow → 黄；否则绿。
- 没有阈值或未启用 → 灰色“仅观察”。

| code | 方向 | 黄 | 红 | 依据 |
|---|---|---|---|---|
| `SOFR_IORB` | 越高越差 | −2 bp | 0 bp | 课程：正常约 −2 ~ −4bp；高于 IORB 即极端异常 |
| `TGCR_IORB` | 越高越差 | −3 bp | 0 bp | 高盛：TGCR 平均低于 IORB 约 4bp |
| `SOFR_EFFR` | 越高越差 | −1 bp | +2 bp | 课程：SOFR 应比 EFFR 低约 2bp |
| `SOFR99_IORB` | 越高越差 | +3 bp | +10 bp | 尾部压力；2025 年秋曾高于 IORB 达 13bp |
| `LIQ_RATIO` | 越低越差 | 12.5 % | 11 % | 高盛：11% ≈ 悬崖边缘；14% 时也曾紧张 |
| `SRF_AMT` | 越高越差 | 1 bn | 25 bn | SRF 被实质使用说明市场拿不到钱 |
| `ONRRP_AMT` | 越低越差 | 100 bn | 20 bn | 缓冲垫耗尽（仅提示意义） |

**综合状态** = `SOFR_IORB`、`TGCR_IORB`、`SOFR99_IORB`、`LIQ_RATIO`、`SRF_AMT` 五项中最差的那个。阈值保存在数据库，可以在界面上修改并“恢复默认”。

---

## 4. 数据源（全部已在本机实测）

### 4.1 纽约联储 Markets API（无需 Key）

| 用途 | 端点 | 备注 |
|---|---|---|
| 利率历史 | `GET https://markets.newyorkfed.org/api/rates/secured/{sofr\|tgcr\|bgcr}/search.json?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | 单次请求 2018-04 至今的 TGCR 已实测成功（约 500KB） |
| EFFR 历史 | `GET https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=…&endDate=…` | 记录中含 `targetRateFrom/To` |
| 回购 / 逆回购 | `GET https://markets.newyorkfed.org/api/rp/results/search.json?startDate=…&endDate=…` | 同时返回 Repo 和 Reverse Repo，**在本地按 `operationType` 过滤**。⚠️ `/api/rp/reverserepo/all/results/search.json` 和 `/api/rp/repo/all/results/search.json` 实测返回 **400**，不要用。一年数据约 320KB，按**自然年分片**拉取 |
| 短债购买 | `GET https://markets.newyorkfed.org/api/tsy/all/results/summary/search.json?startDate=…&endDate=…` | 根节点是 `treasury.auctions[]`，金额字段为字符串 |

- 利率接口的响应根节点为 `refRates[]`。数值字段是 JSON number，可能缺失（老数据没有分位数时直接不写入）。
- `revisionIndicator` 非空表示修订，按 upsert 覆盖即可。

### 4.2 FRED API（需要免费 Key）

- 端点：`GET https://api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={KEY}&file_type=json&observation_start=YYYY-MM-DD`
- 元数据：`GET https://api.stlouisfed.org/fred/series?series_id={ID}&api_key={KEY}&file_type=json` → `seriess[0].units`
- 实测：`api.stlouisfed.org` 可以访问（不带 Key 时返回 400，属预期）；⚠️ **`fred.stlouisfed.org` 网页 / CSV 在本机网络下超时，禁止使用**。
- Key 的获取方式：<https://fredaccount.stlouisfed.org/apikeys>。配置方式见 §5.8。**没有 Key 时 FRED 这个数据源标记为 `SKIPPED`，其余数据源照常工作**；界面上依赖 IORB 的派生指标显示“需要配置 FRED Key”。
- FRED 的序列 ID 是按公开资料选定的，实现时若某个 ID 返回 400 “series does not exist”，在交付说明中列出，不要自行替换成别的序列。

### 4.3 美国财政部 Fiscal Data（无需 Key）

- 端点：`GET https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance?filter=record_date:gte:{from},record_date:lte:{to}&fields=record_date,account_type,open_today_bal,close_today_bal&page[size]=10000&sort=record_date`
- 响应：`data[]`；用 `meta.total-pages` 判断是否需要翻页（`page[number]`）。
- ⚠️ **TGA 口径改过两次**（已实测）。每个 `record_date` 按以下规则取值：

| 时间段 | `account_type` | 取值字段 |
|---|---|---|
| 2022-04-18 起 | `Treasury General Account (TGA) Closing Balance` | `open_today_bal`（此时 `close_today_bal` 为字符串 `"null"`） |
| 2021-10-01 ~ 2022-04-15 | `Treasury General Account (TGA)` | `close_today_bal` |
| 2021-09-30 及以前 | `Federal Reserve Account` | `close_today_bal` |

  只认上面三个 `account_type`（**精确匹配**，尤其不要误取 `…(TGA) Opening Balance`）。数值是**百万美元**的字符串 → 解析后 ÷ 1000 得到 bn。值为 `"null"` 或空时跳过该行。

### 4.4 发布时间（决定同步时间）

| 数据 | 发布时间（美东） | 北京时间 |
|---|---|---|
| SOFR / TGCR / BGCR / EFFR | 次一工作日约 08:00–09:00 | 当日约 21:00–22:00 |
| ON RRP / SRF 操作结果 | 当日 13:15 / 08:30 前后 | 当晚至次日凌晨 |
| TGA（DTS） | 次一工作日约 16:00 | 次日凌晨 |
| 准备金、美联储总资产（H.4.1） | 每周四 16:30 | 周五 05:30 前后 |
| 银行总资产（H.8） | 每周五 16:15（滞后约 1 周） | 周六清晨 |

---

## 5. 后端设计

### 5.1 包结构（沿用现有的按层分包）

```
com.stockcard
├── controller/LiquidityController.java
├── entity/
│   ├── LiquidityObservation.java        (@IdClass LiquidityObservationId)
│   ├── LiquidityObservationId.java
│   ├── LiquidityManualSeries.java
│   ├── LiquidityThreshold.java
│   ├── LiquidityFetchLog.java
│   └── LiquidityWeeklyReport.java
├── repository/ (每个实体一个 Repository)
└── service/liquidity/
    ├── LiquiditySeries.java             (enum：§3.1 + §3.2 的目录元数据)
    ├── SeriesPoint.java                 (record: LocalDate date, double value)
    ├── LiquiditySource.java             (enum: NYFED, TREASURY, FRED, MANUAL)
    ├── LiquiditySourceClient.java       (接口)
    ├── NyFedClient.java
    ├── TreasuryClient.java
    ├── FredClient.java
    ├── LiquiditySyncService.java        (拉取、upsert、日志、定时任务)
    ├── LiquidityCalcService.java        (派生序列、对齐、状态评估)
    ├── LiquidityWeeklyService.java      (周报计算与快照)
    └── LiquidityThresholdService.java   (默认阈值、读写、恢复默认)
```

`LiquiditySourceClient` 接口：

```java
public interface LiquiditySourceClient {
    LiquiditySource source();
    /** 返回 seriesCode -> 观测列表；只负责拉取和解析，不碰数据库。 */
    Map<String, List<SeriesPoint>> fetch(LocalDate from, LocalDate to);
}
```

每个 Client 把“HTTP 获取”和“JSON 解析”分开：解析写成 `static ... parse(JsonNode root)`，以便直接用 fixture 测试。

### 5.2 数据库（`V4__liquidity_monitor.sql`）

```sql
CREATE TABLE liquidity_observation (
    series_code VARCHAR(40)      NOT NULL,
    obs_date    DATE             NOT NULL,
    obs_value   DOUBLE PRECISION NOT NULL,
    source      VARCHAR(20)      NOT NULL,   -- NYFED / TREASURY / FRED / MANUAL
    fetched_at  TIMESTAMP        NOT NULL,
    PRIMARY KEY (series_code, obs_date)
);
CREATE INDEX idx_liq_obs_date ON liquidity_observation (obs_date);

CREATE TABLE liquidity_manual_series (
    code        VARCHAR(40)  PRIMARY KEY,    -- 必须以 "M_" 或 "CDS_" 开头，避免与内置 code 冲突
    name        VARCHAR(100) NOT NULL,
    unit        VARCHAR(20)  NOT NULL,
    description VARCHAR(500),
    created_at  TIMESTAMP    NOT NULL
);

CREATE TABLE liquidity_threshold (
    series_code VARCHAR(40)      PRIMARY KEY,
    direction   VARCHAR(20)      NOT NULL,   -- HIGHER_IS_WORSE / LOWER_IS_WORSE
    yellow      DOUBLE PRECISION NOT NULL,
    red         DOUBLE PRECISION NOT NULL,
    enabled     BOOLEAN          NOT NULL,
    updated_at  TIMESTAMP        NOT NULL
);

CREATE TABLE liquidity_fetch_log (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    source        VARCHAR(20)  NOT NULL,
    mode          VARCHAR(20)  NOT NULL,     -- INCREMENTAL / FULL
    range_from    DATE,
    range_to      DATE,
    started_at    TIMESTAMP    NOT NULL,
    finished_at   TIMESTAMP,
    status        VARCHAR(20)  NOT NULL,     -- RUNNING / SUCCESS / FAILED / SKIPPED
    rows_upserted INT          NOT NULL DEFAULT 0,
    message       VARCHAR(1000)
);

CREATE TABLE liquidity_weekly_report (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    week_end    DATE      NOT NULL UNIQUE,   -- 该周周五
    payload     CLOB      NOT NULL,          -- 生成时的周报 JSON（冻结数值，后续数据修订不影响快照）
    commentary  CLOB,                        -- 用户的点评（Markdown）
    created_at  TIMESTAMP NOT NULL,
    updated_at  TIMESTAMP NOT NULL
);
```

- 阈值表**不在迁移里插默认值**：`LiquidityThresholdService` 读取时若表里没有某个 code，就返回代码中的默认值（§3.4）；“恢复默认”= 删除该行。
- 观测数据量约 30 个序列 × 2,200 天 ≈ 7 万行，H2 完全可以承受。
- 实体中 `@Lob` / `CLOB` 字段的写法参照现有的 `MarketEvent.description`。

### 5.3 写入：批量 upsert

用 `JdbcTemplate.batchUpdate` 执行 H2 原生语句，不要用 JPA 一行一行地 `save`：

```sql
MERGE INTO liquidity_observation (series_code, obs_date, obs_value, source, fetched_at)
KEY (series_code, obs_date) VALUES (?, ?, ?, ?, ?)
```

每批 1000 行；每个数据源一个事务。

### 5.4 同步流程（`LiquiditySyncService`）

```
sync(mode):
  if !running.compareAndSet(false, true) → 抛 409 “同步进行中”
  try:
    for client in [NyFed, Treasury, Fred]:          // 顺序执行，单个失败不影响其他
        from = (mode == FULL || 该源还没有数据)
               ? historyStart
               : 该源所有序列的 max(obs_date) - 10 天      // 覆盖修订和节假日补发
        to   = 今天
        log = 新建 RUNNING 日志
        try:
            points = client.fetch(from, to)
            rows = upsert(points)
            log → SUCCESS, rows
        catch MissingApiKeyException → log → SKIPPED, "未配置 FRED API Key"
        catch Exception             → log → FAILED, 截断后的异常信息（≤1000 字）
  finally:
    running.set(false)
```

- **触发方式**
  1. 手动：`POST /api/liquidity/sync?mode=INCREMENTAL|FULL`，在单线程 `ExecutorService`（Bean，应用关闭时 shutdown）中执行，立即返回 `202`；前端轮询 `GET /api/liquidity/sync/status`。
  2. 定时：`@Scheduled(cron = "${app.liquidity.cron:0 30 9,22 * * *}", zone = "Asia/Shanghai")`，默认每天 09:30 和 22:30 各跑一次增量同步。
  3. 启动补偿：参照 `DatabaseBackupService` 的 `@Scheduled(initialDelay…)` 写法，启动 2 分钟后若最近一次成功同步早于 12 小时前（或从未同步），就跑一次增量同步；**观测表为空时跑 FULL**（即首次自动回填历史）。
- **分片**：NYFED 回购接口按自然年分片；利率接口按 3 年分片；Treasury 按 `total-pages` 翻页；FRED 一次拉完。
- **HTTP**：现有的 `externalRestTemplate` bean 读超时只有 15 秒，历史回填不够用——在 `HttpClientConfig` 新增一个 `liquidityRestTemplate` bean，读超时取 `app.liquidity.read-timeout:60s`，请求头带 `User-Agent: stock-card/1.0`。每个分片失败重试 2 次（间隔 2 秒）。
- **配置项**（加到 `application.properties`）：

```properties
# Liquidity monitor (NY Fed / Treasury need no key; FRED key via .env or the UI)
app.liquidity.enabled=true
app.liquidity.history-start=2018-04-01
app.liquidity.cron=0 30 9,22 * * *
app.liquidity.read-timeout=60s
app.fred.api-key=${FRED_API_KEY:}
```

  `app.liquidity.enabled=false` 时定时任务与启动补偿都不执行（测试配置中设为 false，避免测试访问网络）；手动同步接口不受影响。

### 5.5 计算（`LiquidityCalcService`）

- `Map<String, List<SeriesPoint>> getSeries(Set<String> codes, LocalDate from, LocalDate to)`
  - 原始 / 手动 code → 直接查库。
  - 派生 code → 先加载依赖的原始序列（IORB 要**多往前取 30 天**，保证 as-of 连接有值；`LIQ_RATIO` 的 ONRRP 多往前取 7 天），再按 §3.2 的规则计算并裁剪到 `[from, to]`。
  - 未知 code → 400。
- `Status evaluate(Threshold t, Double latest)` → `GREEN / YELLOW / RED / NONE`。
- 所有计算写成**纯函数**（静态方法），以便不依赖数据库做单测。

### 5.6 周报（`LiquidityWeeklyService`）

- 一周 = 周一至周五，`weekEnd` 为周五。默认取**最近一个已结束的周五**（如果今天是周五，北京时间 22:30 以后才算这一周已结束）。
- 每行包含：`本周值`、`上周值`、`变化`、`状态`、`口径说明`。

| 行 | 本周值的口径 |
|---|---|
| SOFR − EFFR | 周均（bp） |
| SOFR − IORB | 周均 / 周内最高（两列都给）+ “本周 N 天 > 0” |
| TGCR − IORB | 周均 |
| SOFR 99 分位 − IORB | 周内最高 |
| SOFR | 周五值（没有则取周内最后一个） |
| SOFR 成交量 | 周均 |
| 准备金 | 该周三的值（H.4.1 未发布则沿用上一个值并标注“未更新”） |
| ON RRP | 周均 / 周五值 |
| TGA | 周五值 |
| SRF 用量 | 周累计 / 单日最高 |
| 短债购买（RMP） | 本周合计 |
| (准备金 + RRP) / 银行总资产 | 最近可得值 + 数据日期 |
| 高收益债利差 | 周五值 |
| 各手动序列 | 周内最新值 |

- **自动观察要点**（规则生成，3–6 条中文短句），例如：
  - “SOFR 本周有 3 天高于 IORB，最高 +5bp。”
  - “准备金比例 11.2%，距 11% 警戒线仅 0.2 个百分点。”
  - “ON RRP 已降至 4 亿美元，缓冲垫基本耗尽。”
  - “TGA 较上周增加 520 亿美元，抽走准备金。”
  规则放在一个列表里，每条规则 = 条件 + 文案模板，便于以后增加。
- **快照**：`POST /weekly/snapshots` 把计算结果 JSON + 用户点评冻结存库，同一 `weekEnd` 重复保存则覆盖更新。快照不随后续数据修订变化。
- **Markdown 导出**在前端生成（§6.6），后端不负责渲染。

### 5.7 REST API（`/api/liquidity`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/catalog` | 全部序列元数据（内置原始 + 派生 + 手动）：`code, name, unit, frequency, source, kind(RAW/DERIVED/MANUAL), group, description` |
| GET | `/dashboard` | 指标卡片数据：每个核心指标的 `latest{date,value}`、`prevWeek{date,value}`、`change`、`status`、近 60 个观测的 `spark`；`overallStatus`；每个数据源的 `lastSuccessAt / lastStatus / latestObsDate`；`fredConfigured` |
| GET | `/series?codes=A,B,C&from=&to=` | 返回 `{ "A": [["2026-11-19", 3.91], ...], ... }`（紧凑数组，前端直接交给 ECharts）。`from` 默认为一年前，`to` 默认为今天；codes 最多 12 个 |
| GET | `/scatter?from=2018-04-01` | 高盛散点图：`[{ weekEnd, ratio, tgcrIorb, era }]`，`era` 见 §6.5 |
| GET | `/weekly?weekEnd=YYYY-MM-DD` | 实时计算的周报（不入库） |
| GET | `/weekly/snapshots` | 快照列表（id、weekEnd、是否有点评、更新时间） |
| GET / PUT / DELETE | `/weekly/snapshots/{id}` | 查看 / 改点评 / 删除 |
| POST | `/weekly/snapshots` | `{ weekEnd, commentary }`，服务端重新计算后冻结保存 |
| POST | `/sync?mode=INCREMENTAL\|FULL` | 202；已在运行则 409 |
| GET | `/sync/status` | `{ running, lastLogs: [...] }`（最近 20 条） |
| GET | `/thresholds` | 全部阈值（含默认值与“是否已自定义”） |
| PUT | `/thresholds/{code}` | 修改；需校验 yellow / red 的大小关系与 direction 一致 |
| DELETE | `/thresholds/{code}` | 恢复默认 |
| GET / POST | `/manual-series` | 列出 / 新建手动序列 |
| DELETE | `/manual-series/{code}` | 同时删除其全部观测（前端需要二次确认） |
| POST | `/manual-series/{code}/observations` | `{ date, value }` 或数组（批量），upsert |
| DELETE | `/manual-series/{code}/observations/{date}` | 删除单条 |

错误统一交给现有的 `GlobalExceptionHandler`（返回 `{message}`）：参数非法 → 400，资源不存在 → 404，同步冲突 → 409。

### 5.8 对现有代码的最小改动

1. **`AppConfigService` / `ConfigController`**：按 Twelve Data Key 的同样模式增加 FRED Key（设置键 `fred.api-key`，界面保存的值优先于 `.env` 中的 `FRED_API_KEY`）。`GET /api/config` 增加 `fredApiKeyConfigured / fredApiKeyMasked / fredApiKeySource`；`PUT /api/config` 支持 `fredApiKey`。**不得返回明文**。同步更新 `AppConfigServiceTest` / `ConfigControllerTest`。
2. **`MarketEventController` / `MarketEventService`**：新增 `GET /api/market-events/range?from=&to=`，供趋势图叠加事件标注（现有接口只能按月查询）。
3. **`HttpClientConfig`**：新增 `liquidityRestTemplate` bean（§5.4）。
4. **`.env.example`**：新增 `FRED_API_KEY=` 及申请地址说明。
5. **`README.md`**：模块列表加一行，“外部数据源”部分加 FRED 说明。

---

## 6. 前端设计

### 6.1 路由与注册

- `app/modules.ts`：`ModuleId` 增加 `'liquidity'`。
- `Root.tsx`：`const LiquidityModule = lazy(() => import('./features/liquidity/LiquidityModule'));`，并加 `<Route path="/liquidity" element={<ModuleRoute component={LiquidityModule} />} />`。
- `HomePage.tsx`：新增分组「宏观监测 / MACRO」（见 §2），并在设置面板里加 **FRED API Key** 输入框（复用 Twelve Data 那一行的交互：密码框、掩码显示、来源提示、清除按钮）。
- `api.ts`：`AppConfig` 类型增加 FRED 字段；在文件末尾新增「Liquidity Monitor APIs」分区放本模块的类型与请求函数（与现有 Valuation 分区的组织方式一致）。

### 6.2 目录结构

```
frontend/src/features/liquidity/
├── LiquidityModule.tsx          # 外壳：头部（返回首页、刷新按钮、同步状态、主题选择）+ Tab 切换
├── liquidityQueries.ts          # React Query hooks（queryKey 统一以 ['liquidity', ...] 开头）
├── liquidityUtils.ts            # 纯函数：状态评估、格式化、时间范围计算、周报 Markdown 生成
├── liquidityUtils.test.ts
├── charts/
│   ├── echartsCore.ts           # 按需注册 ECharts 组件（见 §6.8）
│   ├── EChart.tsx               # 通用 React 包装：init / setOption / resize / dispose / 主题色
│   ├── TimeSeriesChart.tsx      # 多序列、按单位自动分配左右轴、阈值线、事件标注
│   └── ReserveScatterChart.tsx  # 高盛散点图
├── tabs/
│   ├── OverviewTab.tsx
│   ├── TrendsTab.tsx
│   ├── ScatterTab.tsx
│   ├── WeeklyTab.tsx
│   └── SettingsTab.tsx
├── IndicatorCard.tsx
└── Liquidity.module.css         # 用 CSS Module，不要再往 7000 行的 App.css 里加；颜色一律使用现有主题 CSS 变量
```

### 6.3 Tab 1：总览（默认页）

- **顶部横幅**：综合状态灯 + 一句话结论（例如“🔴 回购市场梗阻：SOFR 高于 IORB 3bp”），以及“数据截至 YYYY-MM-DD”。各数据源的最新日期以小字显示，超过 3 个工作日未更新的标黄。
- **指标卡片网格**（每张卡片：名称、最新值 + 单位、较上周变化（带箭头与颜色）、状态灯、近 60 个观测的迷你折线图）。
  - 第一行（价格）：SOFR − IORB、TGCR − IORB、SOFR − EFFR、SOFR 99 分位 − IORB
  - 第二行（数量）：准备金比例、准备金、ON RRP、TGA
  - 第三行（工具 / 信用）：SRF 用量、短债购买（近 4 周合计）、高收益债利差、手动 CDS（如有）
- 点击卡片跳到“趋势图”Tab，并预选该指标。
- 未配置 FRED Key 时，依赖 IORB 的卡片显示占位：“需要 FRED API Key → 去首页 ⚙ 设置”。
- 观测表为空且同步正在进行时，显示“正在初始化历史数据（约 1–3 分钟）”。

### 6.4 Tab 2：趋势图

- **时间范围**：1M / 3M / 6M / 1Y / 3Y / 全部 + 自定义日期；图内还有 `dataZoom` 滑块。
- **预设面板**（纵向排列，每个面板一张图）：
  1. **利率走廊**：SOFR、TGCR、EFFR、IORB、ON RRP 利率、SRF 利率、目标区间上下限（政策利率用阶梯线 `step: 'end'`）。
  2. **核心利差（bp）**：SOFR − IORB、TGCR − IORB、SOFR − EFFR；`markLine` 画 0 线；> 0 的部分用 `visualMap` 着成红色。
  3. **尾部压力**：SOFR 1~99 分位带（用 `areaStyle` 堆叠出区间带）+ SOFR 99 分位 − IORB。
  4. **流动性存量（bn）**：准备金、ON RRP、TGA（左轴），美联储总资产（右轴）。
  5. **准备金比例（%）**：LIQ_RATIO，带 11%（红）和 14%（黄）两条 `markLine`。
  6. **联储工具使用（bn）**：SRF 用量（柱）、短债购买的月度合计（柱）。
  7. **信用**：高收益债利差 + 全部手动序列。
- **自定义面板**：多选任意 code（最多 6 个），按单位自动分配左右两个轴（超过 2 种单位时提示并拒绝）。
- **事件叠加开关**：调用 `/api/market-events/range`，用竖线 + 标题标注（`markLine` 的 `xAxis` 数据），默认关闭。
- **单位显示**：bn ≥ 1000 时显示为“x.xx 万亿美元”，bp 显示带正负号。

### 6.5 Tab 3：准备金散点（复刻高盛 Exhibit 5）

- X 轴：`LIQ_RATIO`（%）；Y 轴：该周 `TGCR − IORB` 的周均（bp）。
- 三个时期分色（时期边界写成常量数组，方便以后调整）：
  - `2018-04 ~ 2021-08`：灰色
  - `2021-09 ~ 2026-03`：浅蓝
  - `2026-04 ~ 至今`：深蓝
- 最新一周的点放大并标注日期，从上一周到最新一周画一条连线，显示运动方向。
- 竖线：11%（红，“悬崖边缘”）、14%（黄，“2025 年紧张”）；横线：0bp。
- 图下方注明“近似口径，仅供参考”（见 §3.2）。

### 6.6 Tab 4：周报

- 顶部：周选择器（默认最近一周，可前后翻）+ 按钮【保存快照】【复制 Markdown】【下载 .md】。
- 主体：§5.6 的表格 + 自动观察要点 + 点评编辑框（普通多行文本框即可，不需要 TipTap）。
- 侧边（或下拉）：已保存快照列表，点开为只读视图，可以编辑点评或删除。
- **Markdown 格式**（由 `liquidityUtils.buildWeeklyMarkdown(report, commentary)` 生成，需要单测）：

```markdown
# 美元环流周报 2026-11-16 ~ 2026-11-20

> 综合状态：🔴 红 ｜ 数据截至 2026-11-20

| 指标 | 本周 | 上周 | 变化 | 状态 |
|---|---|---|---|---|
| SOFR − EFFR（周均） | +2.0 bp | +9.0 bp | −7.0 | 🟡 |
| ... | | | | |

## 观察要点
- SOFR 本周有 3 天高于 IORB，最高 +5bp。
- ...

## 我的点评
（commentary 原文）
```

  文件名：`美元环流周报-2026-11-20.md`。

### 6.7 Tab 5：设置

- **数据同步**：【增量同步】【全量重建历史】（后者需要二次确认，并提示耗时约 1–3 分钟）、运行状态、最近 20 条日志表（数据源、模式、区间、状态、行数、耗时、信息）。
- **阈值**：表格逐行编辑 direction / 黄 / 红 / 启用，每行有【恢复默认】。
- **手动序列**：新建（校验 code 前缀）、录入观测（日期 + 数值，也支持粘贴多行 `YYYY-MM-DD,数值` 批量录入）、查看最近 20 条、删除；提供【添加甲骨文 5Y CDS】快捷按钮。
- FRED Key 未配置时，在此页顶部也显示提示，并说明“去首页 ⚙ 设置”。

### 6.8 图表库：ECharts

- 新增依赖：`npm install echarts`（**不要**引入 `echarts-for-react`，自己写一个约 60 行的 `EChart.tsx` 包装，避免额外依赖）。
- `echartsCore.ts` 按需注册：`echarts/core` + `LineChart, BarChart, ScatterChart` + `GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, MarkAreaComponent, VisualMapComponent, TitleComponent` + `CanvasRenderer`。
- `vite.config.ts` 的 `codeSplitting.groups` 增加：`{ name: 'vendor-echarts', test: /node_modules[\\/](echarts|zrender)[\\/]/, priority: 30 }`，保证 ECharts 只在打开本模块时加载。
- **主题适配**：`EChart.tsx` 通过 `getComputedStyle(document.documentElement)` 读取文字色、网格线色、背景色等 CSS 变量；监听主题切换（参考 `useTheme.ts` 的实现），切换时重新 `setOption`。
- 用 `ResizeObserver` 处理尺寸变化；组件卸载时调用 `dispose()`。

### 6.9 数据获取与交互

- 使用 React Query：`/dashboard` 的 `staleTime` 设为 5 分钟；`/series` 以 `['liquidity','series',codes,from,to]` 为 key。
- 同步进行中，每 2 秒轮询 `/sync/status`；结束后 `invalidateQueries({ queryKey: ['liquidity'] })`，并用现有的 `useToast` 提示结果。
- 删除类操作用现有的 `useConfirm` 二次确认；错误信息用 `getErrorMessage`。

---

## 7. 关键边界情况

| 情况 | 处理 |
|---|---|
| 美国节假日 / 周末 | 不插值、不补零；图表 x 轴用 `type: 'time'`，自然留空 |
| 数据修订 | 增量同步回看 10 天，upsert 覆盖；周报快照不受影响 |
| 没有 FRED Key | FRED 记 SKIPPED；依赖 IORB / 准备金 / 银行资产的派生指标返回空数组，前端显示引导 |
| 某个数据源失败 | 只影响该源，日志记 FAILED；总览页该数据源的最新日期标黄 |
| 分位数字段缺失 | 该日不写入对应的分位数序列 |
| 金额字段是字符串（tsy、Treasury） | 统一解析；`"null"`、空串、`"."` 都视为缺失 |
| 同一天有多笔回购 / 逆回购操作 | 求和 |
| 同步并发 | `AtomicBoolean` 互斥，第二个请求返回 409 |
| H.8 滞后 | 准备金比例展示“数据日期”，不伪装成最新 |
| 单位 | 后端存储一律为 %、bn；bp 只出现在派生序列中 |

---

## 8. 安全与运维

- 不新增任何对外监听；FRED Key 与 Twelve Data Key 的处理一致（DB 优先于 `.env`，接口只返回掩码）。
- 外部请求只发往三个固定主机（`markets.newyorkfed.org`、`api.fiscaldata.treasury.gov`、`api.stlouisfed.org`），URL 只由代码中的常量与日期参数拼接，不拼接用户输入（防 SSRF）。
- 日志与 `liquidity_fetch_log.message` 中不得出现带 `api_key` 的完整 URL（写入前先把 `api_key=…` 替换成 `api_key=***`）。
- 现有的 `DatabaseBackupService` 会自动覆盖新表，无需改动。

---

## 9. 测试计划

### 9.1 后端（JUnit 5，`mvn test`，不访问网络）

| 测试类 | 覆盖内容 |
|---|---|
| `NyFedClientTest` | 用附录 A 的 fixture 解析利率（含分位数缺失）、回购 / 逆回购拆分与同日求和、tsy 字符串金额、`operationDirection` 过滤 |
| `TreasuryClientTest` | 三段 TGA 口径各一个 fixture；不误取 Opening Balance；`"null"` 处理；÷1000 换算 |
| `FredClientTest` | `"."` 缺失值；Millions → bn 换算；没有 Key 时抛 `MissingApiKeyException`；URL 脱敏 |
| `LiquidityCalcServiceTest` | IORB as-of 连接（含 IOER → IORB 衔接）、各利差的 bp 计算、节假日不产出、`LIQ_RATIO` 的周三对齐与 RRP 周均、`RMP_MONTHLY` |
| `LiquidityThresholdServiceTest`（`@DataJpaTest`） | 默认值回退、修改、恢复默认、两种方向的状态评估边界（恰好等于 yellow / red） |
| `LiquiditySyncServiceTest` | 模拟客户端：upsert 幂等（同步两次行数不变、值被覆盖）、单个数据源失败不影响其他、并发 409、增量起点 = max(date) − 10 天 |
| `LiquidityWeeklyServiceTest` | 周均 / 周最高 / 周五值 / “N 天 > 0” / 上周对比 / 准备金未更新时的标注 |

测试配置中设置 `app.liquidity.enabled=false`。

### 9.2 前端（Vitest）

- `liquidityUtils.test.ts`：状态评估、数值与单位格式化（bp 带符号、万亿换算）、时间范围计算、`buildWeeklyMarkdown` 的输出。
- 不要求对图表组件做渲染测试。

### 9.3 手动验收

1. 首次启动（观测表为空）→ 约 2 分钟后自动 FULL 回填；设置页日志显示 NYFED / TREASURY 成功，FRED 为 SKIPPED（未配置 Key 时）。
2. 配置 FRED Key → 点击【增量同步】→ IORB、准备金等出现；总览卡片数值与附录 A 的 2026-11-19 数据一致（SOFR 3.91、SOFR 99 分位 3.98、TGCR 3.88、EFFR 3.88、TGA ≈ 891.2bn）。
3. 趋势图选 3Y：2025 年秋季与 2026-10-22 ~ 11-05 期间，SOFR − IORB 明显上穿 0 线。
4. 散点图能看到最新点落在 11% 附近。
5. 周报：保存快照 → 下载 .md → 内容与页面一致。
6. 切换主题后图表配色跟随变化；打开其他模块时不会下载 echarts chunk（看 Network 面板）。

---

## 10. 交付阶段

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P1 数据层** | 迁移脚本、实体 / 仓库、三个 Client、同步服务（手动 + 定时 + 启动补偿）、`/sync*`、`/series`（仅原始序列）、`/catalog`、FRED Key 配置（后端 + `.env.example`） | 后端单测通过；手动调接口能拉到 2018 年至今的数据 |
| **P2 计算 + 总览** | `LiquidityCalcService`、阈值服务、`/dashboard`、`/thresholds`；前端模块注册、首页入口、FRED Key 设置项、总览 Tab、ECharts 接入与分包 | 前后端测试 + lint + build 通过；总览页可用 |
| **P3 趋势 + 散点** | 趋势图 Tab（7 个预设面板 + 自定义面板）、散点 Tab、`/scatter`、市场事件区间接口与叠加 | 手动验收 3、4、6 |
| **P4 周报 + 设置** | 周报服务与快照、Markdown 导出、设置 Tab（同步日志、阈值编辑、手动序列 / CDS）、README 更新 | 手动验收 1、2、5 |

---

## 11. 校验命令

```powershell
cd backend;  mvn test
cd frontend; npm run lint; npm test; npm run build
```

---

## 12. 待确认 / 后续可扩展

1. **周报里“天然口 92xx → 9268”这个指标**：转写不清，暂时无法对应，本期**不实现**。确认后可以作为原始序列或手动序列补充。
2. 高盛 Exhibit 5 使用“周内最小值”口径，本期为近似复刻；以后若有日度准备金数据，可以改成精确口径。
3. 可扩展：状态变红时推送通知；把周报快照同步到“行业研报”或文档中心；接入 SOFR 期货、FRA-OIS 等付费数据源。
4. **放水雷达（P5）**：在美联储下一次扩表 / QE 的早期发现端倪，设计见 [qe-radar.md](./qe-radar.md)。

---

## 附录 A：实测响应样例（作为单测 fixture，放在 `backend/src/test/resources/liquidity/`）

**A.1 `nyfed-rates-sofr.json`**（`/api/rates/secured/sofr/last/2.json`，2026-11-21 实测，已截断）

```json
{ "refRates": [
  { "effectiveDate": "2026-11-19", "type": "SOFR", "percentRate": 3.91, "percentPercentile1": 3.85,
    "percentPercentile25": 3.88, "percentPercentile75": 3.95, "percentPercentile99": 3.98,
    "volumeInBillions": 3161, "revisionIndicator": "" }
] }
```

**A.2 `nyfed-rates-effr.json`**

```json
{ "refRates": [
  { "effectiveDate": "2026-11-19", "type": "EFFR", "percentRate": 3.88, "percentPercentile1": 3.85,
    "percentPercentile25": 3.88, "percentPercentile75": 3.89, "percentPercentile99": 3.90,
    "targetRateFrom": 3.75, "targetRateTo": 4.00, "volumeInBillions": 100, "revisionIndicator": "" }
] }
```

**A.3 `nyfed-rp.json`**（`/api/rp/results/search.json`，Repo 与 Reverse Repo 混在一起返回）

```json
{ "repo": { "operations": [
  { "operationId": "RP 112026 25", "auctionStatus": "Results", "operationDate": "2026-11-20",
    "operationType": "Repo", "operationMethod": "Full Allotment", "term": "Overnight",
    "totalAmtSubmitted": 0, "totalAmtAccepted": 0,
    "details": [ { "securityType": "Treasury", "amtSubmitted": 0, "amtAccepted": 0, "percentOfferingRate": 4.00 } ] },
  { "operationId": "RP 112026 26", "auctionStatus": "Results", "operationDate": "2026-11-20",
    "operationType": "Reverse Repo", "operationMethod": "Fixed Rate", "term": "Overnight",
    "participatingCpty": 2, "acceptedCpty": 2, "totalAmtSubmitted": 401000000, "totalAmtAccepted": 401000000,
    "details": [ { "securityType": "Treasury", "amtSubmitted": 401000000, "amtAccepted": 401000000,
                   "percentOfferingRate": 3.75, "percentAwardRate": 3.75 } ] }
] } }
```

期望：2026-11-20 → `SRF_AMT=0`、`SRF_RATE=4.00`、`ONRRP_AMT=0.401`、`ONRRP_RATE=3.75`。

**A.4 `nyfed-tsy.json`**（`/api/tsy/all/results/summary/search.json`）

```json
{ "treasury": { "auctions": [
  { "operationId": "OR 111826 25", "auctionStatus": "Results", "operationType": "Outright Bill Purchase",
    "operationDate": "2026-11-18", "settlementDate": "2026-11-19", "operationDirection": "P",
    "totalParAmtSubmitted": "24437000000", "totalParAmtAccepted": "1756000000" }
] } }
```

期望：2026-11-18 → `RMP_BILLS=1.756`。

**A.5 `treasury-tga.json`**（三段口径，单位：百万美元）

```json
{"data":[
 {"record_date":"2021-09-30","account_type":"Federal Reserve Account","close_today_bal":"215160","open_today_bal":"173745"},
 {"record_date":"2021-10-01","account_type":"Treasury General Account (TGA)","close_today_bal":"132452","open_today_bal":"215160"},
 {"record_date":"2026-11-19","account_type":"Treasury General Account (TGA) Opening Balance","close_today_bal":"null","open_today_bal":"892310"},
 {"record_date":"2026-11-19","account_type":"Treasury General Account (TGA) Closing Balance","close_today_bal":"null","open_today_bal":"891223"}
],"meta":{"total-count":4,"total-pages":1}}
```

期望：2021-09-30 → 215.160bn；2021-10-01 → 132.452bn；2026-11-19 → 891.223bn。

**A.6 `fred-observations.json`**（实现时按真实响应补充；结构如下）

```json
{ "observations": [
  { "date": "2026-11-12", "value": "2965.4" },
  { "date": "2026-11-19", "value": "." }
] }
```

---

## 附录 B：课程要点 → 本模块功能对照

| 课程要点 | 对应功能 |
|---|---|
| 回购市场是资金的“批发市场 / 新发地”，决定股债汇商的“零售市场” | 总览页的综合状态与“利率走廊”面板 |
| SOFR 正常应比 EFFR 低约 2bp；持平就不正常；高于 IORB（3.90）属于极端异常 | `SOFR_EFFR`、`SOFR_IORB` 及其阈值 |
| 10/22 ~ 11/5 两个“黑色周”SOFR 持续高于 IORB | 趋势图的“核心利差”面板 + 市场事件叠加 |
| 高盛：TGCR − IORB 对比（准备金 + RRP）/ 银行总资产，11% 是悬崖边缘，2025 年紧张时为 14% | 散点 Tab、`LIQ_RATIO` 及其阈值 |
| 缩表几乎不可能（“棘轮效应”），RMP 将常态化：11 月起约 100 亿美元/月，2027 年 4 月起约 250 亿美元/月 | `RMP_BILLS` / `RMP_MONTHLY` 面板 |
| 周报：SOFR − EFFR、SOFR 99 分位（4.05 → 3.98）、准备金（约 2.96 万亿）、TGA（9300 → 9100 亿）、SRF（700 万 → 1100 万） | 周报 Tab 的行定义 |
| AI 公司 CDS（甲骨文 292–305 → 257–308） | 手动序列 `CDS_ORCL_5Y` |
