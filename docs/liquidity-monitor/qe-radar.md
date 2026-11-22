# 放水雷达（QE Radar）设计文档

> 版本：v1.0（2026-11-22）
> 状态：已实现（P5a–P5d）；实测与实现差异见交付说明
> 读者：实现者（Sonnet）与项目所有者
> 定位：「美元流动性监测」模块里的一个新 Tab。目标是**在美联储下一次往市场注入流动性（扩表 / QE）的早期发现端倪**。

---

## 0. 实现者须知（先读这一节）

1. 本功能是对**已上线代码的增量扩展**。现有类（`LiquiditySeries`、`NyFedClient`、`FredClient`、`LiquiditySyncService`、`LiquidityCalcService`、`LiquidityThresholdService`、`LiquidityWeeklyService`、`LiquidityModule.tsx` 等）只做本文明确列出的改动，不要顺手重构。
2. Schema 由 Flyway 管理，`ddl-auto=validate`。新表放进 **`V5__qe_radar.sql`**，不要修改已有的 `V4__liquidity_monitor.sql`。
3. 所有外部接口、字段名和口径陷阱都已在 2026-11-22 本机实测过（见 §4 与附录 A），**不要凭记忆换成其他接口**。
4. 测试**不得访问真实网络**。fixture 按附录 B 的脚本一次性下载后提交到仓库。
5. 本文所有阈值都是**经验值**，不是官方标准。全部集中在代码的一个位置，并且可以在设置页修改（§3.5）。实现完成后，用「历史回放」（§6）检查一遍，结果写进交付说明。
6. 按 §10 的阶段顺序交付，每个阶段都要跑通 §11 的校验命令。

---

## 1. 背景：给小白的一页说明

美联储“放水”不是从 0 一下子跳到 QE，而是**一级一级往上走**。雷达只做两件事：

- **判断现在在第几级**（行动层，靠数据确认，延迟 0–7 天）；
- **评估往上升一级的可能性**（压力层 + 意图层，通常能提前几周到几个月看到苗头）。

> ⚠️ 雷达**不预测具体哪天宣布 QE**。历史上 QE 几乎都是对危机或经济明显恶化的“反应”，由 FOMC 在会议上宣布，市场当天就会定价。雷达能做到的，是让你在**压力积累阶段**就注意到，并在**换挡后几天内**确认。

### 1.1 五级阶梯

| 级别 | 名称 | 白话解释 | 典型历史时期 |
|---|---|---|---|
| **L0** | 收水（QT） | 美联储让持有的债券到期后不再续买，市场上的钱被慢慢抽走 | 2017-10 ~ 2019-07；2022-06 ~ 2025-11 |
| **L1** | 中性 | 不抽也不加：到期的钱再买回去，资产负债表大体持平 | 2014-11 ~ 2017-09；2026 年下半年 |
| **L2** | 技术性扩表 | 主动买**短期国债**给银行补准备金。官方说法是“不是 QE”，但效果是往系统里加钱 | 2019-10 ~ 2020-02；2025-12 ~ 2026 年上半年 |
| **L3** | 紧急注入 | 市场出事，用回购、贴现窗口、央行货币互换或临时工具救急。规模大，但通常是临时的 | 2008-09；2019-09；2023-03（硅谷银行） |
| **L4** | QE | 大规模、持续地买**长期国债或 MBS**，压低长期利率，持续加钱 | 2008-11 ~ 2014-10；2020-03 ~ 2022-03 |

### 1.2 三层指标

| 层 | 回答的问题 | 领先程度 | 代表指标 |
|---|---|---|---|
| **压力层** | 有没有逼美联储出手的理由？ | 领先几周到几个月 | 金融压力指数、VIX、高收益债利差、萨姆规则、回购利差 |
| **意图层** | 美联储（和市场）是不是准备宽松了？ | 领先几天到几周 | 市场降息定价、政策利率离 0 还有多远、联储声明关键词 |
| **行动层** | 是不是已经在加水？ | 同步到滞后一周 | SOMA 持仓结构、长债 / MBS 购买操作、贴现窗口、货币互换、净流动性 |

### 1.3 2026-11-22 实测读数（验收参考）

| 指标 | 值 | 解读 |
|---|---|---|
| SOMA 13 周变化 | **−3.9 bn**（短债 +42.9，长债 −3.9，MBS −47.1，TIPS +1.6） | 短债购买刚好抵消 MBS 到期，属于 **L1 中性** |
| 最新实施细则（2026-10-28） | 有“通过购买短期国债……维持充足准备金”的指令 | 文本层面仍是 RMP |
| 2 年期国债收益率 − EFFR | 4.76 − 3.88 = **+88 bp** | 市场在定价**加息**，不是降息 |
| 2026-10-28 FOMC 声明 | 两名委员主张加息 | 鹰派 |
| VIX | 28.44 | 黄 |
| STLFSI4 / NFCI / 萨姆规则 | −0.87 / −0.478 / 0.00 | 绿 |
| 贴现窗口 / 央行互换 / H.4.1 回购 | 9.06 / 0.15 / 0.001 bn | 平静 |

预期雷达结论：**L1 中性，升级可能性「中」**（回购利差偏紧 + VIX 偏高，但政策意图偏鹰）。“最可能的下一步”是 **L2（加大短债购买）**，而不是 QE。

---

## 2. 命名与入口

| 项 | 值 |
|---|---|
| Tab 名 | **放水雷达**（放在「总览」之后，作为第 2 个 Tab） |
| 英文 | `QE RADAR` |
| 后端 API 前缀 | `/api/liquidity/qe-radar` |
| 新数据源枚举 | 新增 `LiquiditySource.FEDTEXT`（联储文本）；SOMA、长债与 MBS 操作都归入现有的 `NYFED` |
| 首页 | 「美元流动性监测」卡片右上角显示未读提醒数角标（§7.3） |
| 总览 Tab | 顶部横幅下方加一行雷达摘要，点击跳到雷达 Tab（§7.2） |

---

## 3. 指标体系

单位约定沿用 [design.md §3](./design.md)：利率用 %，金额用 bn（十亿美元），利差用 bp。

### 3.1 新增原始序列（入库到 `liquidity_observation`）

| code | 名称 | 单位 | 频率 | 来源 | 取值方式 |
|---|---|---|---|---|---|
| `SOMA_TOTAL` | SOMA 总持仓 | bn | 周 | NYFED soma | `total` ÷ 1e9 |
| `SOMA_BILLS` | SOMA 短期国债 | bn | 周 | NYFED soma | `bills` ÷ 1e9 |
| `SOMA_COUPONS` | SOMA 中长期国债 | bn | 周 | NYFED soma | (`notesbonds` + `tips` + `frn`) ÷ 1e9；空串按 0 |
| `SOMA_MBS` | SOMA 机构证券（MBS 等） | bn | 周 | NYFED soma | (`mbs` + `cmbs` + `agencies`) ÷ 1e9；空串按 0 |
| `COUPON_OPS_NET` | 中长期国债净购买操作 | bn | 事件 | NYFED tsy | 见 §4.1.2 |
| `AGENCY_OPS_NET` | MBS / 机构债净购买操作 | bn | 事件 | NYFED ambs + tsy | 见 §4.1.3 |
| `STLFSI4` | 圣路易斯联储金融压力指数 | idx | 周（周五） | FRED | `STLFSI4`；0 = 历史平均 |
| `NFCI` | 芝加哥联储金融条件指数 | idx | 周（周五） | FRED | `NFCI`；越高越紧 |
| `VIX` | VIX 波动率指数 | idx | 日 | FRED | `VIXCLS` |
| `SAHM` | 萨姆规则衰退指标（实时） | pp | 月 | FRED | `SAHMREALTIME`；≥ 0.5 历史上对应衰退开始 |
| `UST2Y` | 2 年期国债收益率 | % | 日 | FRED | `DGS2` |
| `PRIMARY_CREDIT` | 贴现窗口一级信贷余额 | bn | 周（周三） | FRED | `WLCFLPCL`（百万美元，÷1000） |
| `CB_SWAPS` | 央行流动性互换余额 | bn | 周（周三） | FRED | `SWPT`（百万美元，÷1000） |
| `FED_REPO` | H.4.1 回购协议余额 | bn | 周（周三） | FRED | `WORAL`（百万美元，÷1000） |

- `SOMA_COUPONS + SOMA_BILLS + SOMA_MBS` 恰好等于 `SOMA_TOTAL`（已用 2026-11-18 数据验证，附录 A.1）。`tipsInflationCompensation` **不计入** `total`，也不要计入任何序列。
- FRED 单位换算沿用 `FredClient.unitDivisor`：`Index`、`Percentage Points` 都原样保留（现有逻辑只对 `Millions` 做 ÷1000，无需改动）。
- 前端对 `idx`、`pp` 两个新单位按普通小数显示（2 位小数）。

### 3.2 新增派生序列（读取时计算，不入库）

as-of 取值统一用 `floorEntry`（取 ≤ 目标日期的最近一个观测），和现有 `spreadBpAsOf` 一致。

| code | 名称 | 单位 | 公式 | 产出日期 |
|---|---|---|---|---|
| `SOMA_13W` | SOMA 13 周变化 | bn | SOMA_TOTAL(t) − asOf(SOMA_TOTAL, t − 91d) | SOMA_TOTAL 的每个日期 |
| `SOMA_BILLS_13W` | 短债持仓 13 周变化 | bn | 同上，对 SOMA_BILLS | 同上 |
| `SOMA_LONG_13W` | 长债 + MBS 13 周变化 | bn | 对 (SOMA_COUPONS + SOMA_MBS) 同上计算 | 同上 |
| `QE_OPS_28D` | 近 28 天长债 + MBS 净购买 | bn | 对 COUPON_OPS_NET 与 AGENCY_OPS_NET 合并后，求 (t − 27d, t] 内的和 | 区间内每个**工作日**（周一至周五）；从第一个有操作的日期开始 |
| `NONSEC_ASSETS` | 联储非证券资产 | bn | FED_ASSETS(t) − asOf(SOMA_TOTAL, t)；as-of 最多回看 6 天，超出则跳过 | FED_ASSETS 的每个日期 |
| `NONSEC_4W` | 非证券资产 4 周变化 | bn | NONSEC_ASSETS(t) − asOf(NONSEC_ASSETS, t − 28d) | 同上 |
| `PRIMARY_CREDIT_4W` | 贴现窗口 4 周变化 | bn | 同样的 28 天 as-of 差 | PRIMARY_CREDIT 的日期 |
| `CB_SWAPS_4W` | 央行互换 4 周变化 | bn | 同上 | CB_SWAPS 的日期 |
| `NET_LIQ` | 净流动性 | bn | FED_ASSETS(t) − asOf(TGA, t) − asOf(ONRRP_AMT, t)；TGA 回看最多 5 天，缺失则跳过；ONRRP 缺失按 0 | FED_ASSETS 的每个日期 |
| `NET_LIQ_4W` / `NET_LIQ_13W` | 净流动性 4 / 13 周变化 | bn | 28 / 91 天 as-of 差 | 同上 |
| `CUT_PRICING` | 市场降息定价 | bp | (UST2Y − EFFR) × 100，只在两者同日都有值时产出 | 日 |
| `RATE_CHANGE_6M` | 政策利率半年变化 | bp | (FFTR_HIGH(t) − asOf(FFTR_HIGH, t − 182d)) × 100 | FFTR_HIGH 的日期 |

说明：

- **as-of 差值**的统一实现：`changeOver(points, days)`，返回 `value(t) − floor(t − days)`；如果没有更早的观测，该日不产出。写成 `LiquidityCalcService` 的纯静态方法，加单测。
- `NONSEC_ASSETS` 包含贷款、回购、互换、各类紧急工具，也包含未摊销溢价等慢变量。所以只看它的 **4 周变化**，用来兜底捕捉 2020 年各类临时工具、2023 年 BTFP 这种不在单独序列里的救助。
- `NET_LIQ` 是市场上流行的“净流动性”口径，跟风险资产相关性高。**TGA 下降带来的净流动性增加属于“财政放水”，不是 QE**，界面上要分开说明（§7.1）。
- 在 `LiquiditySeries` 中新增这些枚举值，依赖关系照现有写法登记。`needsFred()` 会自动把依赖 FRED 的派生序列标出来。

### 3.3 联储文本信号（不入观测表，单独建表，见 §5.2）

逐句匹配正则，给每份文件打类别标签。匹配前先规范化文本：`\u2018 \u2019 → '`、`\u201C \u201D → "`、`\u2013 \u2014 → -`、`\u00A0 → 空格`，并合并连续空白。分句规则为 `(?<=[.;])\s+(?=[A-Z"])`。所有正则都**不区分大小写**；排除词命中时，该句不计入这个类别。

| 类别 | 权重 | 对应阶梯 | 匹配（任一命中） | 该句出现以下任一则排除 |
|---|---|---|---|---|
| `QE_PURCHASE` | +3 | L4 | `\b(increase\|add to) (its\|the System Open Market Account\|the Federal Reserve's) holdings of (longer-term )?(Treasury securities\|agency mortgage-backed securities\|agency debt)`；`\bprogram to purchase\b`；`\bpurchas\w*[^.]{0,40}\$[\d.,]+ (billion\|trillion)[^.]{0,40}(longer-term Treasury\|agency mortgage-backed\|agency debt\|Treasury securities)`；`\bpurchas\w* (additional )?(longer-term Treasury securities\|agency mortgage-backed securities) at a pace of`；`\bin the amounts needed to support smooth market functioning`；`increase the size of the Federal Reserve's balance sheet` | `Treasury bills`、`reinvest`、`roll over`、`ample (level of )?reserves`、`rather than`、`reduc`、`conclude` |
| `TAPER` | −2 | — | `reduce the pace of (its )?(asset )?purchases`；`at a (somewhat )?(slower\|reduced) pace`；`rather than \$`；`conclude (its )?asset purchase program`；`end (its )?asset purchases` | — |
| `RMP` | +2 | L2 | `reserve management purchases`；`\bpurchas\w*[^.]{0,30}Treasury bills`；`increase[^.]{0,80}holdings[^.]{0,80}Treasury bills`；`purchases of shorter-term Treasury securities` | `reinvest` |
| `QT_END` | +1 | L1 | `conclude the reduction`；`end the reduction`；`stop (reducing\|the reduction)`；`slow(ing)? the pace of (decline\|reduction\|runoff)`；`reduce the monthly redemption cap`；`lower(ing)? the (monthly )?(redemption )?cap` | — |
| `QT` | −2 | L0 | `(begin\|initiate\|start\|continue)[^.]{0,30}(reduc\w*\|reduction of) (its\|the Federal Reserve's\|its aggregate) (securities )?holdings`；`balance sheet normalization program` | `conclude`、`slow`、`\bend\b` |
| `EMERGENCY` | +2 | L3 | `\bfacility\b`；`section 13\(3\)`；`liquidity swap`；`swap lines?`；`Bank Term Funding Program`；`term repurchase agreement operations`；`additional funding to eligible`；`lower(ed)? the primary credit rate` | — |
| `CUT` | +1 | — | `(decided\|voted) to (lower\|reduce) the target range` | `preferred` |
| `HIKE` | −1 | — | `(decided\|voted) to (raise\|increase) the target range` | `preferred` |
| `DISSENT_EASE` | +0.5 | — | `preferred to (lower\|reduce) the target range` | — |
| `DISSENT_TIGHTEN` | −0.5 | — | `preferred to (raise\|increase) the target range` | — |

- **`preferred no change` 的方向取决于本次决定**：同一份文件命中 `CUT` 时，计为 `DISSENT_TIGHTEN`；命中 `HIKE` 时，计为 `DISSENT_EASE`；两者都没有命中时忽略。这是唯一一条文件级规则，在逐句匹配之后处理。
- 每份文件里同一类别**只计一次**，`stance` 是命中类别的权重之和。
- 以上正则已在附录 C 的 16 份历史文件和 2026-10-28 的两份文件上用 Python 实测，结果见附录 D。
- 文件类型 `docType`：根据标题和 URL 判断。标题含 `FOMC statement` → `STATEMENT`；含 `Minutes` → `MINUTES`；由声明页内的 *Implementation Note* 链接抓到的 → `IMPL_NOTE`；其他 → `OTHER`。
- **会议纪要（`MINUTES`）只展示命中结果，不参与任何评分和判定**，因为纪要会回顾讨论过去的购买操作，噪音很大。
- **指令对比**：`IMPL_NOTE` 抽取 `directs the Desk to:` 之后到第一个 `."` 之间的文本，存为 `directive`。再按句子跟上一份 `IMPL_NOTE` 的 `directive` 做集合差，结果存为 `directiveChanges = {added:[...], removed:[...]}`。对比前先把数字替换成 `#`（例如利率 `3.75 percent` → `#.# percent`），避免每次调息都被当成指令变化。
- 规则写成一个列表 `List<TextRule(category, weight, List<Pattern> include, List<Pattern> exclude)>`，放在 `FedTextClassifier` 里，便于以后增减。

### 3.4 阶梯判定（行动层，`QeStageEngine`，纯函数）

对评估日 `t` 按 **L4 → L3 → L2 → L0 → L1** 的顺序检查，第一个满足的即为结果。下文的“红 / 黄”指 §3.5 中该指标的**当前有效阈值**，所以用户在设置页调整阈值时，阶梯判定会一起变化。

| 级别 | 条件 |
|---|---|
| **L4** | (`QE_OPS_28D` ≥ 红 **且** `SOMA_13W` ≥ 黄) **或** `SOMA_LONG_13W` ≥ 红 |
| **L3** | 在 [t − 20d, t] 内满足任一：`PRIMARY_CREDIT_4W` ≥ 红；`CB_SWAPS_4W` ≥ 红；`NONSEC_4W` ≥ 红；`SRF_AMT` ≥ 红的日期**至少 2 个**（只统计 2009-01-01 及以后的日期） |
| **L2** | `SOMA_13W` ≥ 黄 |
| **L0** | `SOMA_13W` ≤ −25 bn（常量 `QT_THRESHOLD_BN`） |
| **L1** | 其他 |

关键设计说明（**请保留为代码注释**）：

- **为什么 L4 用净额，不用“有没有长债购买”**：2014–2017 年美联储一直用到期资金再买 MBS（每月 200–300 亿美元），2019 年 8–10 月也曾把 MBS 到期资金转投国债。这些都是再投资，不是 QE。用 `SOMA_13W` 净增长兜底，可以排除这类情况。
- **`SOMA_LONG_13W` 分支**用于 2009–2014 年。那时 MBS 购买没有 ambs 操作记录（附录 A.4），只能靠周度持仓确认。
- **为什么 SRF 只统计 2009 年以后**：2008 年之前，回购是美联储**每天的常规操作**，规模几十亿到几百亿美元，不代表紧急注入。
- **为什么要求 2 个日期**：避免把季末、月末单日的 SRF 使用当成紧急注入。
- **L3 回看 20 天**：救急工具通常几周内就会退出，这样能避免阶段每周来回跳动。
- 扭转操作（2011–2012）是卖短债买长债，`SOMA_COUPONS` 中包含 3 年以内的 notes，所以长债净额变化不大，判定结果是 L1。这符合事实：扭转操作不扩表。

输出：

```java
public record StageResult(int level,                 // 0..4
                          LocalDate asOf,
                          List<String> triggers,     // 中文触发说明，例如 "SOMA 13 周 +212.4 bn ≥ 25"
                          LocalDate since)           // 连续处于该级别的起始评估日（只在历史计算中给出）
```

**“已宣布、待执行”标记**：如果最近 45 天内有 `docType ∈ {STATEMENT, IMPL_NOTE, OTHER}` 的文本命中 `QE_PURCHASE`，而数据判定 < L4，界面显示“L4 已宣布，待执行”。`EMERGENCY` 用 14 天窗口，对应 L3。这个标记**不改变** `level`，只作为附加字段 `announced`。

**历史阶梯**：对 2007-01-01 以来每个 `SOMA_TOTAL` 日期（约 1000 个周三）逐一评估，一次性加载所需序列后在内存里计算。

### 3.5 默认阈值（加入 `LiquidityThresholdService.DEFAULTS`）

在雷达里，“红 / 黄”表示**放水信号强 / 弱**，绿表示没有信号。设置页沿用现有阈值表格。

| code | 层 | 方向 | 黄 | 红 | 依据 |
|---|---|---|---|---|---|
| `STLFSI4` | 压力 | 越高越强 | 0 | 1.5 | 0 = 历史平均；2020-03 / 2008 年峰值约 5 |
| `NFCI` | 压力 | 越高越强 | −0.3 | 0 | 0 = 历史平均；> 0 表示金融条件比平均更紧 |
| `VIX` | 压力 | 越高越强 | 25 | 35 | 经验值 |
| `HY_OAS` | 压力 | 越高越强 | 4.5 | 6.0 | 现有序列，以前没有阈值；% 口径 |
| `SAHM` | 压力 | 越高越强 | 0.3 | 0.5 | 0.5 是萨姆规则的触发线 |
| `CUT_PRICING` | 意图 | 越低越强 | −50 | −100 | 2 年期国债比 EFFR 低 1 个百分点 ≈ 市场预期一年内降息约 4 次 |
| `FFTR_HIGH` | 意图 | 越低越强 | 2.0 | 1.0 | 利率接近 0 时，QE 是下一张牌 |
| `RATE_CHANGE_6M` | 意图 | 越低越强 | −50 | −100 | 半年内降息幅度 |
| `SOMA_13W` | 行动 | 越高越强 | 25 | 150 | 黄 = L2 门槛 |
| `SOMA_LONG_13W` | 行动 | 越高越强 | 25 | 100 | 红 = L4 门槛 |
| `QE_OPS_28D` | 行动 | 越高越强 | 10 | 40 | 红 = L4 门槛之一 |
| `PRIMARY_CREDIT_4W` | 行动 | 越高越强 | 10 | 50 | 红 = L3 门槛 |
| `CB_SWAPS_4W` | 行动 | 越高越强 | 10 | 50 | 红 = L3 门槛 |
| `NONSEC_4W` | 行动 | 越高越强 | 25 | 100 | 红 = L3 门槛 |
| `NET_LIQ_13W` | 行动 | 越高越强 | 100 | 300 | 仅展示，不参与判定 |

- 方向沿用现有的 `HIGHER_IS_WORSE` / `LOWER_IS_WORSE` 枚举，不新增枚举值。前端在雷达 Tab 中把状态文案换成「无信号 / 弱信号 / 强信号」（§7.1）。
- 现有的 `SRF_AMT` 阈值（黄 1 / 红 25）保持不变，L3 判定直接使用它的红值。
- 这些新阈值**不影响**现有总览的综合状态。`OVERALL_CODES` 保持不变。

### 3.6 升级可能性（压力层 + 意图层）

取各指标的**最新值**状态：

- **压力层集合 P**：`STLFSI4`、`NFCI`、`VIX`、`HY_OAS`、`SAHM`、`SOFR_IORB`、`SOFR99_IORB`、`LIQ_RATIO`（`LIQ_RATIO` 在 2018-04-01 之前不计入，因为当时不是“充足准备金”体制，这个比例没有可比性）
- **意图层集合 I**：`CUT_PRICING`、`FFTR_HIGH`、`RATE_CHANGE_6M`、`TEXT_SIGNAL`

其中 `TEXT_SIGNAL` 取最近 60 天、`docType ≠ MINUTES` 的文本：命中 `QE_PURCHASE` → 红；命中 `RMP`、`QT_END`、`EMERGENCY`、`CUT` 中任一 → 黄；否则绿。没有任何文本时为 `NONE`。

| 结果 | 条件（自上而下，取第一个满足的） |
|---|---|
| **高** | P 中红 ≥ 2；或 P 中红 ≥ 1 且 I 中红 ≥ 1；或 `TEXT_SIGNAL` = 红 |
| **中** | P 中红 ≥ 1；或 P 中黄及以上 ≥ 3；或 I 中红 ≥ 1；或 I 中黄及以上 ≥ 2 |
| **低** | 其他 |

`NONE` 状态（缺数据、没有 FRED Key）不计数。返回的 `reasons` 列出所有黄 / 红指标的中文说明。

### 3.7 “最可能的下一步”（启发式提示，可以同时给出多条）

| 条件 | 提示 |
|---|---|
| 当前 ≤ L2，且 `SOFR_IORB`、`SOFR99_IORB`、`LIQ_RATIO` 任一为黄 / 红 | “L2：加大短债购买（技术性补准备金）” |
| `STLFSI4`、`VIX`、`HY_OAS` 任一为红 | “L3：启用紧急工具（SRF / 贴现窗口 / 互换）” |
| `FFTR_HIGH` 为红，且（P 中红 ≥ 1 或 `SAHM` 为红） | “L4：QE（利率空间耗尽）” |
| 都不满足 | “维持现状” |

---

## 4. 数据源（全部在 2026-11-22 实测）

### 4.1 纽约联储 Markets API（无需 Key，扩展现有 `NyFedClient`）

#### 4.1.1 SOMA 周度持仓

- `GET https://markets.newyorkfed.org/api/soma/summary.json`
- **一次返回 2003-07-09 至今的全部周度数据**（约 320 KB），不支持日期过滤，拉回后在本地按 `[from, to]` 过滤。
- 根节点 `soma.summary[]`；每条字段：`asOfDate`、`mbs`、`cmbs`、`tips`、`frn`、`tipsInflationCompensation`、`notesbonds`、`bills`、`agencies`、`total`。**全部是美元单位的字符串**，可能带小数，也可能是空串 `""`，空串按 0 处理。
- ⚠️ `asOfDate` 通常是周三，**节假日会变成周二**（已见 2020-11-10、2024-06-18、2024-12-24、2024-12-31、2026-11-10）。按原日期入库，派生计算一律用 as-of，**不要假设是周三**。
- 在 `fetch()` 中**每次都调用一次**（不按年分片）。

#### 4.1.2 国债购买 / 出售操作（扩展现有 `parseTreasuryPurchases`）

- 端点不变：`/api/tsy/all/results/summary/search.json?startDate=…&endDate=…`（实测有 2009 年至今的数据）。
- 现有 `RMP_BILLS` 逻辑**不变**。
- 新增 `COUPON_OPS_NET`：`operationType` 含 `Coupon`、`TIPS` 或 `FRN`（不区分大小写）。`operationDirection == "P"` 记正值，`"S"` 记负值，按 `operationDate` 求和后 ÷ 1e9。
- **小额测试过滤**：单笔 `totalParAmtAccepted` < 0.5 bn（常量 `SMALL_VALUE_MAX_BN = 0.5`）时忽略。实测近期测试操作都在 0.025–0.075 bn。
- `operationType == "Outright Agency Debt Purchase"`（2009 年出现过）归入 `AGENCY_OPS_NET`。
- 过滤后某天净额为 0（全是小额测试）时，不写入该日。

#### 4.1.3 MBS 操作（新端点）

- `GET https://markets.newyorkfed.org/api/ambs/all/results/summary/search.json?startDate=…&endDate=…`，按自然年分片（与 rp、tsy 相同）。
- 根节点 `ambs.auctions[]`；金额字段 `totalAmtAcceptedPar`，是字符串，可能为空串。
- **只认 `operationType` 以 `Outright` 开头的记录**：`Purchase` 结尾或 `operationDirection == "P"` 记正值，`Sale` 结尾或 `"S"` 记负值。**`Dollar Roll`、`Coupon Swap` 一律忽略**（它们不改变持仓规模）。
- 同样适用小额测试过滤（实测 2026 年的 Dollar Roll、Coupon Swap 是 0.02 bn，Specified Pool Sale 金额为空）。
- ⚠️ 实测**只有 2018 年起的数据**（2009、2012 年返回空数组）。所以 2009–2014 年的 MBS QE 只能靠 `SOMA_MBS` 周度持仓确认（§3.4 已考虑）。

#### 4.1.4 `isFinal` 与历史起点

- 新端点也要使用现有的 `isFinal()`（`auctionStatus` 不为 `Results` 时跳过）。
- 实测 `/rp/results` 有 2008 年数据，EFFR 有 2007-01 起的数据，SOFR 等 2018 年以前返回空数组（不报错）。

### 4.2 FRED（扩展现有 `FredClient.SPECS`）

`SPECS` 中追加：

```java
new Spec("STLFSI4", "STLFSI4"),
new Spec("NFCI", "NFCI"),
new Spec("VIX", "VIXCLS"),
new Spec("SAHM", "SAHMREALTIME"),
new Spec("UST2Y", "DGS2"),
new Spec("PRIMARY_CREDIT", "WLCFLPCL"),
new Spec("CB_SWAPS", "SWPT"),
new Spec("FED_REPO", "WORAL")
```

已通过 FRED 网页确认这些序列 ID 都存在，单位分别为 Index / Index / Index / Percentage Points / Percent / Millions / Millions / Millions。

### 4.3 美联储文本（新数据源 `FEDTEXT`，新类 `FedTextClient`）

**RSS**：`GET https://www.federalreserve.gov/feeds/press_monetary.xml`

- ⚠️ 响应**以 UTF-8 BOM 开头**，而且服务端不一定声明 charset，必须按**字节**读取后用 UTF-8 解码，再去掉开头的 `\uFEFF`。否则会出现 `â€"` 这类乱码，实测 PowerShell 就踩到了。
- 结构：`rss/channel/item[]`，每个 item 有 `title`、`link`（CDATA）、`pubDate`（CDATA，RFC 1123）。**只保留最近约 15 条**（实测覆盖约 5 个月），所以必须每天同步，不能依赖 RSS 回补历史。
- XML 解析必须关闭 DTD 和外部实体（`disallow-doctype-decl = true`，`FEATURE_SECURE_PROCESSING = true`）。

**详情页**：例如 `https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm`

- 同样按字节读取、UTF-8 解码。
- 正文提取（`FedHtml.extractText`，纯函数）：
  1. 找到 `id="article"`，找不到就找 `id="content"`。**实施细则页面只有 `id="content"`**，已实测。
  2. 从该位置截取到文档末尾，删除 `<script>…</script>` 和 `<style>…</style>`，再删除所有标签。
  3. 解码实体：`&amp; &lt; &gt; &quot; &#39; &nbsp; &ndash; &mdash; &rsquo; &lsquo; &rdquo; &ldquo;` 以及 `&#NNN;`、`&#xHH;`。
  4. 合并空白；截断到第一个 `Last Update` 或 `For media inquiries`（取先出现的）。
  5. 不引入 jsoup，用正则实现即可。正文结构已在 2008、2020、2025、2026 年的页面上实测一致。
- **实施细则链接**：在声明页 HTML 中匹配 `href="(/newsevents/pressreleases/monetary\d{8}a1\.htm)"[^>]*>\s*Implementation Note`，补全为绝对 URL 后再抓取，`docType = IMPL_NOTE`。
- **日期**：从 URL 的 `monetary(\d{8})` 解析，不使用 RSS 的 `pubDate`（历史 URL 没有 RSS）。
- **标题**：取 `<title>`，去掉前缀 `Federal Reserve Board - `。
- **历史回补**：表为空或 `mode = FULL` 时，额外抓取附录 C 的 16 个历史 URL（全部已实测可访问且有 `id="article"`）。
- **礼貌性**：同一次同步内串行请求，两次请求间隔 1 秒，`User-Agent` 沿用 `stock-card/1.0`。已经入库的 URL 不再重复抓取。
- **SSRF 防护**：只允许 `https://www.federalreserve.gov/newsevents/pressreleases/` 前缀的 URL。RSS 里其他链接直接丢弃。

---

## 5. 后端设计

### 5.1 新增与改动的文件

```
com.stockcard
├── controller/QeRadarController.java                 (新, /api/liquidity/qe-radar)
├── entity/FedTextEvent.java, QeRadarAlert.java, QeRadarState.java   (新)
├── repository/FedTextEventRepository.java, QeRadarAlertRepository.java, QeRadarStateRepository.java (新)
└── service/liquidity/
    ├── LiquiditySeries.java          (改：§3.1/§3.2 新枚举值；Group 增加 PRESSURE, POLICY, BALANCE_SHEET)
    ├── LiquiditySource.java          (改：增加 FEDTEXT)
    ├── NyFedClient.java              (改：§4.1)
    ├── FredClient.java               (改：§4.2)
    ├── LiquidityHttp.java            (改：新增 getText(URI)，按字节读取、UTF-8 解码、去 BOM，复用重试逻辑)
    ├── LiquidityCalcService.java     (改：新派生序列 + changeOver / trailingSum 纯函数)
    ├── LiquidityThresholdService.java(改：DEFAULTS 追加 §3.5)
    ├── LiquiditySyncService.java     (改：§5.3)
    ├── LiquidityWeeklyService.java   (改：§5.6)
    └── qe/                           (新包)
        ├── FedTextClient.java        (RSS + 详情页 + 历史 URL；只负责抓取，返回 List<FedDocument>)
        ├── FedHtml.java              (正文 / 标题 / 实施细则链接提取，纯函数)
        ├── FedTextClassifier.java    (§3.3 规则、分句、stance、指令抽取与对比，纯函数)
        ├── FedTextService.java       (同步：去重、分类、入库、生成文本提醒)
        ├── QeStageEngine.java        (§3.4，纯函数)
        ├── QeLikelihood.java         (§3.6 / §3.7，纯函数)
        ├── QeEpisodes.java           (§6 历史事件常量)
        ├── QeRadarService.java       (组装当前雷达、历史阶梯、回放)
        └── QeRadarAlertService.java  (§5.5)
```

### 5.2 数据库（`V5__qe_radar.sql`）

```sql
CREATE TABLE fed_text_event (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    url               VARCHAR(300)     NOT NULL UNIQUE,
    doc_date          DATE             NOT NULL,
    title             VARCHAR(500)     NOT NULL,
    doc_type          VARCHAR(20)      NOT NULL,   -- STATEMENT / IMPL_NOTE / MINUTES / OTHER
    body              CLOB             NOT NULL,   -- 提取后的纯文本
    categories        VARCHAR(200)     NOT NULL,   -- 逗号分隔，可为空串
    hits              CLOB             NOT NULL,   -- JSON: [{"category":"RMP","sentence":"..."}]
    stance            DOUBLE PRECISION NOT NULL,
    directive         CLOB,                        -- 仅 IMPL_NOTE
    directive_changes CLOB,                        -- JSON: {"added":[...],"removed":[...]}；第一份或无变化时为 NULL
    fetched_at        TIMESTAMP        NOT NULL
);
CREATE INDEX idx_fed_text_date ON fed_text_event (doc_date);

CREATE TABLE qe_radar_alert (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    alert_type   VARCHAR(30)   NOT NULL,   -- STAGE_CHANGE / LIKELIHOOD_CHANGE / TEXT_HIT
    title        VARCHAR(200)  NOT NULL,
    detail       VARCHAR(2000),
    ref_date     DATE,
    acknowledged BOOLEAN       NOT NULL,
    created_at   TIMESTAMP     NOT NULL
);
CREATE INDEX idx_qe_alert_ack ON qe_radar_alert (acknowledged);

CREATE TABLE qe_radar_state (
    state_key   VARCHAR(40)  PRIMARY KEY,  -- 'stage' / 'likelihood'
    state_value VARCHAR(200) NOT NULL,
    updated_at  TIMESTAMP    NOT NULL
);
```

实体中 CLOB 字段的写法参照现有的 `LiquidityWeeklyReport.payload`。

### 5.3 同步改动（`LiquiditySyncService`）

1. **历史起点**：`application.properties` 中的 `app.liquidity.history-start` 改为 **`2007-01-01`**。不支持这么早的数据源会返回空数组，已实测不报错。现有 `/scatter` 的默认起点仍为 2018-04-01，不受影响。
2. **一次性回填**：`catchUpIfDue()` 中，如果 `SOMA_TOTAL` 没有任何观测（即刚升级），就执行 **FULL**。现有用户已有 2018 年以后的数据，增量同步不会回补 2007–2018 年，所以必须走这一步。
3. **FEDTEXT 数据源**：`FedTextService` 不产出观测点，不实现 `LiquiditySourceClient`。在 `runAndRelease` 中，**所有数值数据源跑完以后**，用同样的日志逻辑（`liquidity_fetch_log`，`source = FEDTEXT`）执行 `fedTextService.sync(mode)`，`rows_upserted` 记为新入库的文件数。做法是把 `syncSource` 中“新建日志 → 执行 → finish”的部分抽成私有方法 `runLogged(String source, LocalDate from, LocalDate to, Mode mode, Callable<Integer> work)`，供两类数据源共用。`?source=FEDTEXT` 时只跑文本同步。
4. **同步结束事件**：在 `runAndRelease` 的 `finally` 中，先 `running.set(false)`，再发布 `LiquiditySyncFinishedEvent(mode)`（`ApplicationEventPublisher`）。`QeRadarAlertService` 用 `@EventListener` 接收，自己捕获所有异常，**不能影响同步结果**。
5. 前端 `SYNC_SOURCES` 增加 `'FEDTEXT'`。

### 5.4 计算与组装（`QeRadarService`）

- `RadarView current()`：
  - 加载 §3.4 / §3.6 需要的所有序列：最近 450 天，`SOMA_*` 类序列额外往前取 100 天，保证 13 周差值有输入。
  - 评估日 = 今天。行动层中的周度序列取最新值。
  - 返回：

```json
{
  "asOf": "2026-11-20",
  "stage": { "level": 1, "name": "中性", "triggers": ["SOMA 13 周 −3.9 bn，介于 −25 与 25 之间"],
             "since": "2026-09-02", "announced": null },
  "likelihood": { "level": "MEDIUM", "reasons": ["SOFR − IORB +1bp（红）", "VIX 28.4（黄）", "..."] },
  "nextSteps": ["L2：加大短债购买（技术性补准备金）"],
  "layers": {
    "pressure": [Card...], "intent": [Card...], "action": [Card...]
  },
  "latestTexts": [ { "id": 12, "docDate": "2026-10-28", "title": "...", "docType": "IMPL_NOTE",
                     "categories": ["RMP"], "stance": 2.0, "hasDirectiveChanges": false } ],
  "unreadAlerts": 0,
  "fredConfigured": true
}
```

  `Card` **复用** `LiquidityDashboardService.Card`。把它的卡片构建逻辑抽成包内可见的静态方法，供两边共用，不要复制。`TEXT_SIGNAL` 卡片的 `latest.value` 存最近一份命中文件的 `stance`，`status` 按 §3.6 计算，`spark` 为空。

- `List<StageResult> stageHistory(LocalDate from)`：§3.4 的历史阶梯。合并连续相同级别后返回 `[{from, to, level, triggers(第一周的)}]`。
- `Replay replay(String episodeId)`：§6。
- `since` 由历史阶梯计算：从当前往回找，同级别连续段的起点。

### 5.5 提醒（`QeRadarAlertService`）

收到 `LiquiditySyncFinishedEvent` 后：

1. 计算 `current()` 的阶梯级别和升级可能性。
2. 跟 `qe_radar_state` 中的 `stage`、`likelihood` 比较：
   - 表里**没有记录**（首次运行）→ 只写入状态，**不生成提醒**。
   - 级别变化 → 生成 `STAGE_CHANGE`，例如“放水阶段：L1 中性 → L2 技术性扩表”，`detail` 为触发说明。
   - 升级可能性变化 → 生成 `LIKELIHOOD_CHANGE`，例如“升级可能性：低 → 中”，`detail` 为原因列表。
   - 然后更新状态。
3. 文本提醒由 `FedTextService` 在入库时直接生成：新入库文件满足 `docType ≠ MINUTES`、`doc_date` 在最近 30 天内（历史回补不提醒），并且命中 `QE_PURCHASE`、`TAPER`、`RMP`、`QT_END`、`QT`、`EMERGENCY`、`CUT` 中任一类别，或者 `directive_changes` 非空 → 生成 `TEXT_HIT`。
4. 本期**只做应用内提醒**：首页角标 + 雷达 Tab 的提醒列表。不做桌面通知、邮件或推送（见 §12）。

### 5.6 周报（`LiquidityWeeklyService`）

- `observations` 规则列表末尾追加一条：“放水雷达：当前 L{n} {名称}，升级可能性{高 / 中 / 低}。”
- 评估日用该周周五，所以需要 `QeRadarService` 提供 `stageAt(LocalDate)` 和 `likelihoodAt(LocalDate)`。`likelihoodAt` 的 `TEXT_SIGNAL` 只用 `doc_date ≤ 该日` 的文本。
- 快照冻结机制不变。

### 5.7 REST API（`/api/liquidity/qe-radar`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `` | 当前雷达（§5.4 `RadarView`） |
| GET | `/stage-history?from=2007-01-01` | 历史阶梯分段 |
| GET | `/texts?limit=50` | 文本列表，按 `doc_date` 倒序，不含 `body` |
| GET | `/texts/{id}` | 单份文本：`body`、`hits`、`directive`、`directiveChanges` |
| GET | `/episodes` | 历史事件列表（§6） |
| GET | `/replay/{episodeId}` | 回放数据；未知 id → 404 |
| GET | `/alerts?unreadOnly=false&limit=50` | 提醒列表，按 id 倒序 |
| GET | `/alerts/unread-count` | `{ "count": 2 }`，首页用 |
| POST | `/alerts/{id}/ack` | 标为已读；不存在 → 404 |
| POST | `/alerts/ack-all` | 全部标为已读 |

错误处理沿用 `GlobalExceptionHandler`。

---

## 6. 历史回放（`QeEpisodes`）

### 6.1 事件常量

| id | 名称 | 关键日期（竖线） | 类型 | 给小白的一句话 |
|---|---|---|---|---|
| `QE1_2008` | QE1 首轮量化宽松 | 2008-11-25 宣布；2009-03-18 扩大 | QE | 雷曼倒闭后，紧急工具已经用满，开始买 MBS |
| `QE2_2010` | QE2 | 2010-11-03 | QE | 没有危机，因为经济复苏太弱而加码；8 月杰克逊霍尔会议已有暗示 |
| `QE3_2012` | QE3 无限期购买 | 2012-09-13；2012-12-12 加码 | QE | 失业率高企，开始每月买 400 亿美元 MBS，不设上限 |
| `REPO_2019` | 2019 回购危机 | 2019-09-17 回购操作；2019-10-11 宣布买短债 | L3 → L2 | 准备金太少，回购利率一天飙到 10%。官方强调“不是 QE” |
| `COVID_2020` | 疫情无限 QE | 2020-03-15；2020-03-23 无限量 | QE | 史上最快的放水，两周内从降息到无限量购买 |
| `SVB_2023` | 硅谷银行危机 | 2023-03-12 | L3（对照组） | 只救急，**没有** QE。用来对比“救急”和“放水”的区别 |
| `RMP_2025` | 结束缩表 + 储备管理购买 | 2025-10-29 宣布停止缩表；2025-12-10 宣布 RMP | L1 → L2 | 准备金逼近“悬崖”，先停止收水，再买短债 |

每个事件：`id, name, keyDates[], type, summary`，窗口为 `[第一个关键日期 − 180 天, 最后一个关键日期 + 90 天]`。

### 6.2 回放数据（`/replay/{id}`）

```json
{
  "episode": { ... },
  "from": "2008-05-29", "to": "2009-06-16",
  "stages": [ { "from": "...", "to": "...", "level": 3 } ],
  "series": { "SOMA_TOTAL": [[date, v], ...], "SOMA_LONG_13W": [...], "NONSEC_ASSETS": [...],
              "STLFSI4": [...], "VIX": [...], "HY_OAS": [...], "CUT_PRICING": [...], "FFTR_HIGH": [...],
              "PRIMARY_CREDIT": [...], "CB_SWAPS": [...], "SRF_AMT": [...] },
  "leads": [ { "code": "STLFSI4", "name": "...", "firstYellow": "2008-06-13", "firstRed": "2008-09-19",
               "leadDaysYellow": 165, "leadDaysRed": 67 } ],
  "texts": [ { "id": 3, "docDate": "2008-11-25", "title": "...", "categories": ["QE_PURCHASE"] } ]
}
```

- `leads`：对 §3.5 中压力层、意图层、行动层的每个指标，在 `[第一个关键日期 − 180 天, 第一个关键日期]` 内，找**第一次**达到黄、红的日期，计算到第一个关键日期的天数。没有达到就返回 `null`。按 `leadDaysYellow` 降序排列。
- `series` 统一裁剪到窗口内。没有数据的序列（例如 2008 年还没有 SOFR）不返回。

---

## 7. 前端设计

### 7.1 雷达 Tab（`tabs/QeRadarTab.tsx`）

Tab 内部有一个分段切换：**雷达 | 历史回放 | 联储文本 | 提醒（n）**。

**雷达（默认）**

1. **阶梯卡**（`qeRadar/StageLadder.tsx`）：L0–L4 五个台阶横向排列，当前级别高亮，显示“自 YYYY-MM-DD 起”。有 `announced` 时，在 L4 或 L3 上加虚线边框和“已宣布，待执行”标签。下方用一句白话解释当前级别（文案见 §1.1，放在 `qeRadarUtils.ts` 的 `STAGE_INFO` 常量里），并列出 `triggers`。
2. **升级可能性**：低 / 中 / 高三色胶囊，下面列出 `reasons` 和“最可能的下一步”。
3. **三层卡片**：压力层、意图层、行动层各一行，复用 `IndicatorCard`。状态文案改为「无信号 / 弱信号 / 强信号」，给 `IndicatorCard` 加一个可选 prop `statusLabels`。每张卡片的 `title` 提示用 catalog 中的 `description`。点击卡片跳到趋势图并选中该指标，复用 `openTrend`。
4. **历史阶梯图**：ECharts 折线（`step: 'end'`），纵轴为 0–4 级，覆盖 2007 年至今；右轴叠加 `SOMA_TOTAL`。用 `markArea` 给 L0–L4 着色（颜色取主题变量），每个历史事件的第一个关键日期画一条竖线（`markLine`）。
5. **净流动性小图**：`NET_LIQ` 折线 + `NET_LIQ_13W` 柱状图，附说明：“净流动性上升可能来自美联储扩表，也可能来自 TGA 下降（财政花钱），后者不是 QE”。

**历史回放**（`qeRadar/ReplayPanel.tsx`）

- 下拉选择事件，显示一句话说明。
- 上方是阶梯条：窗口内按级别着色的横条。
- 中间三张小图：压力（STLFSI4、VIX、HY_OAS）、意图（CUT_PRICING、FFTR_HIGH）、行动（SOMA_TOTAL、SOMA_LONG_13W、NONSEC_ASSETS）。关键日期画竖线。
- 下方是**提前量表格**（`leads`）：指标、首次弱信号日期、提前天数、首次强信号日期、提前天数。

**联储文本**（`qeRadar/TextList.tsx`）

- 列表：日期、类型、标题（外链原文，`target="_blank" rel="noopener noreferrer"`）、类别标签（颜色按对应阶梯）、stance。
- 展开后显示命中句子，命中部分加粗；`IMPL_NOTE` 额外显示指令对比：新增句子绿色、删除句子红色、带删除线。

**提醒**（`qeRadar/AlertList.tsx`）

- 列表：时间、类型图标、标题、详情。未读项加粗。
- 按钮：单条“已读”和“全部标为已读”。

### 7.2 总览 Tab

在横幅下方加一行：`放水雷达：L1 中性 ｜ 升级可能性：中 ｜ 未读提醒 2 →`，点击切换到雷达 Tab。数据来自 `useQeRadar()`。

### 7.3 首页角标

`HomePage.tsx` 加载时请求 `/alerts/unread-count`（失败时静默）。`count > 0` 时，在「美元流动性监测」卡片的图标右上角显示小红点和数字。样式放在现有首页样式里，颜色用主题变量。

### 7.4 其他前端改动

- `LiquidityModule.tsx`：`TABS` 中插入 `{ id: 'qe', label: '放水雷达' }`（位于 overview 之后）。`SettingsTab` 的 `onStartSync` 支持 `FEDTEXT`。
- `trendPanels.ts` 增加两个预设面板，并同步补充 `trendPanels.test.ts`：
  - **SOMA 结构（bn）**：`SOMA_BILLS`、`SOMA_COUPONS`、`SOMA_MBS` 堆叠面积图，加 `SOMA_TOTAL` 折线。
  - **净流动性（bn）**：`NET_LIQ`（左轴）、`NET_LIQ_13W`（柱）。
- `TrendsTab` 的分组映射加上 `['PRESSURE', '压力'], ['POLICY', '政策'], ['BALANCE_SHEET', '资产负债表']`。
- `liquidityUtils.formatValue`：支持 `idx`、`pp` 两个单位。
- `api.ts`：在「Liquidity Monitor APIs」分区末尾增加雷达相关的类型和请求函数。`SyncSource` 类型加上 `'FEDTEXT'`。
- `liquidityQueries.ts`：`useQeRadar`、`useQeStageHistory`、`useQeTexts`、`useQeText(id)`、`useQeEpisodes`、`useQeReplay(id)`、`useQeAlerts`。queryKey 统一以 `['liquidity', 'qe', ...]` 开头，这样同步完成后现有的 `invalidateQueries({queryKey: LIQUIDITY_KEY})` 会自动刷新这些数据。
- 首页角标的 queryKey 不在 `LIQUIDITY_KEY` 下，进入首页时直接请求即可。

---

## 8. 关键边界情况

| 情况 | 处理 |
|---|---|
| 没有 FRED Key | 压力层、意图层大部分为 `NONE`，可能性只按有数据的指标计算，并在 `reasons` 中注明“缺少 FRED 数据”。行动层的 SOMA 和操作数据来自 NYFED，**阶梯判定仍然可用**，只是 L3 中贴现窗口、互换、非证券资产三个条件失效 |
| SOMA 日期是周二 | 一律 as-of，不按星期对齐 |
| 小额测试操作 | 单笔 < 0.5 bn 忽略（§4.1.2） |
| ambs 金额为空串 | 按缺失处理，跳过该笔 |
| 美联储网站改版、正文提取为空 | 该文件不入库，同步日志记 `FAILED`，并写明 URL。不能影响数值数据源 |
| RSS 中有非 pressreleases 链接 | 丢弃 |
| 同一 URL 再次出现 | 跳过（`url` 唯一）。`FULL` 模式**也不重抓**已有文件 |
| 首次运行提醒风暴 | 首次只写状态；历史回补的文本不生成提醒 |
| 2008 年以前的常规回购 | 不参与 L3（§3.4） |
| `LIQ_RATIO` 在 2018 年以前 | 不参与升级可能性 |

---

## 9. 测试计划

### 9.1 后端（不访问网络）

| 测试类 | 覆盖内容 |
|---|---|
| `NyFedClientTest`（扩展） | SOMA 解析：字符串金额、空串、三分组之和等于 total、周二日期；tsy：`COUPON_OPS_NET` 正负号、小额过滤、Agency Debt 归类、2012 年扭转操作同日买卖相抵；ambs：忽略 Dollar Roll / Coupon Swap、空金额、Sale 记负值 |
| `FredClientTest`（扩展） | 新 Spec 的 Index 单位不换算 |
| `LiquidityCalcServiceTest`（扩展） | `changeOver`（含无更早观测、周二 as-of）、`QE_OPS_28D` 的 28 天边界、`NONSEC_ASSETS` 6 天容忍、`NET_LIQ`（TGA 缺失时跳过、RRP 缺失按 0）、`CUT_PRICING` |
| `FedHtmlTest` | 用附录 B 的 HTML fixture：正文起止、`id="content"` 回退、实体解码、实施细则链接提取、标题去前缀；带 BOM 的 RSS 字节解析出正确的 `–` |
| `FedTextClassifierTest` | 见附录 D 的期望表；分句；每份文件同一类别只计一次；排除词；指令抽取；数字归一化后调息不算指令变化 |
| `QeStageEngineTest` | 每个级别至少一个正例；判定优先级（L4 + L3 同时满足时取 L4）；L3 的 20 天回看；SRF 单日不触发、2 天触发、2008 年不触发；MBS 再投资（ops 大但 `SOMA_13W` ≈ 0）不判 L4；修改阈值后判定随之变化 |
| `QeLikelihoodTest` | 高 / 中 / 低各条件分支；`NONE` 不计数；`LIQ_RATIO` 2018 年以前忽略；`TEXT_SIGNAL` 60 天窗口、排除 MINUTES |
| `QeRadarAlertServiceTest` | 首次运行不提醒；级别变化提醒；可能性变化提醒；监听器内部异常不外抛 |
| `FedTextServiceTest` | 已有 URL 跳过；非白名单 URL 丢弃；30 天以前的文本不提醒；正文为空时记 FAILED |
| `LiquiditySyncServiceTest`（扩展） | `SOMA_TOTAL` 为空时 catch-up 走 FULL；FEDTEXT 失败不影响其他数据源；同步结束事件已发布 |

### 9.2 前端（Vitest）

- `qeRadarUtils.test.ts`：级别名称与文案、可能性文案、状态文案映射、`leads` 排序与天数格式化。
- `trendPanels.test.ts`：两个新预设面板。
- `liquidityUtils.test.ts`：`idx`、`pp` 单位格式化。

### 9.3 手动验收

1. 升级后首次启动，约 2 分钟后自动 FULL。设置页日志中 NYFED、TREASURY、FRED、FEDTEXT 都显示成功；`SOMA_TOTAL` 最早日期 ≤ 2007-01-10。
2. 雷达 Tab 的读数与 §1.3 一致：L1、可能性为中、下一步为 L2。
3. 历史阶梯**大致**呈现以下轮廓（允许边界相差几周，偏差较大时在交付说明中列出）：

   | 时期 | 期望级别 |
   |---|---|
   | 2008-09 ~ 2008-11 | L3 |
   | 2009 ~ 2010-Q1 | L4 |
   | 2010-12 ~ 2011-06 | L4 |
   | 2011-07 ~ 2012-10 | L1（扭转操作） |
   | 2012-12 ~ 2014-10 | L4 |
   | 2014-11 ~ 2017-09 | L1 |
   | 2017-10 ~ 2019-07 | L0 |
   | 2019-09 ~ 2020-02 | L3 |
   | 2020-03 ~ 2022-03 | L4 |
   | 2022-06 ~ 2025-11 | L0（2023-03 短暂 L3） |
   | 2026-01 ~ 2026-05 前后 | L2 |
   | 当前 | L1 |

4. 回放 `COVID_2020`：STLFSI4、VIX 的首次强信号在 2020-03-15 之前，提前量 ≥ 7 天。
5. 联储文本列表能看到附录 C 的 16 份历史文件，加上最近 RSS 中的文件。2026-10-28 的实施细则标记为 `RMP`，2026-10-28 的声明标记为 `DISSENT_TIGHTEN`。
6. 手动删除 `qe_radar_state` 中的 `stage` 记录，并把值改成 `0`（模拟上次是 L0），再增量同步 → 生成“L0 → L1”提醒，首页出现角标，“全部标为已读”后角标消失。

---

## 10. 交付阶段

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P5a 数据** | NYFED SOMA / tsy 长债 / ambs，FRED 新序列，`history-start` 改为 2007，catch-up FULL 规则，`LiquiditySeries` 新原始与派生序列 + 单测，阈值默认值 | 后端单测；手动验收 1 |
| **P5b 文本** | `LiquidityHttp.getText`，`FedHtml`，`FedTextClassifier`，`FedTextClient` / `FedTextService`，V5 迁移，同步接入 FEDTEXT，`/texts*` | 后端单测；手动验收 5 |
| **P5c 引擎** | `QeStageEngine`，`QeLikelihood`，`QeRadarService`，`QeRadarAlertService`，`/qe-radar`、`/stage-history`、`/alerts*`，周报观察要点 | 后端单测；手动验收 2、3（通过接口检查） |
| **P5d 前端 + 回放** | 雷达 Tab 四个分区，总览摘要行，首页角标，趋势预设面板，`QeEpisodes`，`/episodes`、`/replay` | 前后端测试 + lint + build；手动验收 2–6 |

---

## 11. 校验命令

```powershell
cd backend;  mvn test
cd frontend; npm run lint; npm test; npm run build
```

---

## 12. 不做 / 后续可扩展

- **桌面通知、邮件或微信推送**：本期不做。级别变化通常要几周才发生一次，首页角标加周报已经够用。以后如果要做，可以订阅 `qe_radar_alert` 的新增记录。
- **OFR 分市场回购数据（DVP / GCF / Tri-party）、国债结算日历、跨币种基差、FIMA 回购**：这些更适合诊断危机，不适合预判放水；接入成本高，跨币种基差也没有免费数据源。暂不接入。
- **联邦基金期货 / SOFR 期货隐含降息路径**：没有免费、稳定的接口，暂时用 `CUT_PRICING`（2 年期国债 − EFFR）近似。
- **美联储官员讲话**（`press_speeches.xml`）：数量多、噪音大，可以在本期稳定后作为 `OTHER` 类型、低权重接入。
- **财政部回购（Treasury buybacks）与季度再融资（QRA）**：属于“财政放水”，以后可以作为 `NET_LIQ` 的解释项接入。

---

## 附录 A：实测响应样例

**A.1 `nyfed-soma-summary.json`**（截取，2026-11-22 实测；第二条是节假日的周二）

```json
{"soma": {"summary": [
  {"asOfDate":"2026-08-19","mbs":"1923213096802.50","cmbs":"7514450437.30","tips":"276076310700","frn":"20045553800","tipsInflationCompensation":"106549630280.56","notesbonds":"3601804749000","bills":"537751926700","agencies":"2347000000","total":"6368753087439.80"},
  {"asOfDate":"2026-11-10","mbs":"1876203782906.70","cmbs":"7311561325.40","tips":"277655585900","frn":"22873047100","tipsInflationCompensation":"108078446229.29","notesbonds":"3597864734500","bills":"580659926700","agencies":"2347000000","total":"6364922126861.20"},
  {"asOfDate":"2026-11-18","mbs":"1876153373779.30","cmbs":"7311561325.40","tips":"277655585900","frn":"22873047100","tipsInflationCompensation":"108078446229.29","notesbonds":"3597864734500","bills":"580659926700","agencies":"2347000000","total":"6364865229304.70"}
]}}
```

以上三条均为实测原值。

期望（2026-11-18）：`SOMA_TOTAL = 6364.865`，`SOMA_BILLS = 580.660`，`SOMA_COUPONS = 3597.865 + 277.656 + 22.873 = 3898.394`，`SOMA_MBS = 1876.153 + 7.312 + 2.347 = 1885.812`，三者之和 = 6364.866（四舍五入误差内等于 total）。实测 `SOMA_13W`（对 2026-08-19）= **−3.888 bn**。

**A.2 `nyfed-tsy-mixed.json`**（tsy 字段与现有 fixture 一致；以下组合用于测试）

| operationDate | operationType | direction | totalParAmtAccepted | 期望 |
|---|---|---|---|---|
| 2025-11-04 | Outright Coupon Purchase | P | "50000000" | 忽略（小额测试） |
| 2026-11-03 | Outright Coupon Sale | S | "50000000" | 忽略 |
| 2020-04-30 | Outright Coupon Purchase | P | "3000000000" | `COUPON_OPS_NET` +3.0 |
| 2012 年任意一天 | Coupon Purchase P 8.0 bn + Coupon Sale S 7.5 bn | | | 当日 +0.5 |
| 2009 年任意一天 | Outright Agency Debt Purchase | P | 2.0 bn | `AGENCY_OPS_NET` +2.0 |

**A.3 `nyfed-ambs.json`**

| operationDate | operationType | direction | totalAmtAcceptedPar | 期望 |
|---|---|---|---|---|
| 2020-03-31 | Outright TBA Purchase | P | "7115000000" | `AGENCY_OPS_NET` +7.115 |
| 2026-11-18 | Outright Specified Pool Sale | S | "" | 跳过 |
| 2026-11-12 | Coupon Swap | （空） | "20000000" | 忽略 |
| 2026-11-10 | Dollar Roll | （空） | "20000000" | 忽略 |

**A.4 历史覆盖实测**

| 端点 | 结果 |
|---|---|
| tsy 2009-03 ~ 2009-04 | 23 条：Coupon Purchase、Agency Debt Purchase、TIPS Purchase |
| tsy 2012-09 ~ 2012-10 | 40 条：含 Coupon Sale 与 TIPS Sale（扭转操作） |
| ambs 2009、2012 | **0 条** |
| ambs 2018 / 2019 / 2020 / 2021 | 177 / 96 / 563 / 574 条 |
| rp 2008-03 | 31 条（当时的常规操作） |
| rates/sofr 2007–2009 | 0 条（不报错） |
| rates/effr 2007–2009 | 755 条 |
| Treasury DTS 2007-01 | `Federal Reserve Account` 可用 |

**A.5 2025 年 10 月以来非短债操作（全部是小额测试）**

```
2026-11-03 Outright Coupon Sale     S  50000000
2026-06-23 Outright FRN Purchase    P  25000000
2026-06-02 Outright Coupon Sale     S  25000000
2025-11-04 Outright Coupon Purchase P  50000000
2025-10-30 Outright TIPS Purchase   P  25000000
2025-10-21 Outright Coupon Sale     S  75000000
```

月度短债购买（bn）：2025-12 38.1、2026-01 48.2、02 54.3、03 60.4、04 33.8、05 39.2、06 19.8、07 30.4、08 28.7、09 11.9、10 13.1、11（至 21 日）9.1。

---

## 附录 B：fixture 下载脚本（只运行一次，结果提交到 `backend/src/test/resources/liquidity/qe/`）

```powershell
$dir = 'backend\src\test\resources\liquidity\qe'
New-Item -ItemType Directory -Force $dir | Out-Null
$ua = 'stock-card/1.0'
$get = { param($u, $f) Invoke-WebRequest $u -UseBasicParsing -UserAgent $ua -OutFile (Join-Path $dir $f) }
& $get 'https://www.federalreserve.gov/feeds/press_monetary.xml' 'fed-rss.xml'
foreach ($id in '20081125b','20090318a','20101103a','20120913a','20121212a','20131218a','20141029a','20170920a','20190731a','20191011a','20200315a','20200323a','20230312a','20251029a','20251210a','20251210a1','20261028a','20261028a1') {
  & $get "https://www.federalreserve.gov/newsevents/pressreleases/monetary$id.htm" "fed-$id.html"
}
& $get 'https://markets.newyorkfed.org/api/soma/summary.json' 'nyfed-soma-summary-full.json'
```

- SOMA 全量文件约 320 KB，**裁剪**到附录 A.1 需要的若干条后再提交，保存为 `nyfed-soma-summary.json`。
- tsy 和 ambs 的 fixture 按附录 A.2 / A.3 的表格**手写**最小 JSON（字段名照抄现有的 `nyfed-tsy.json`）。
- 美联储网站内容属于美国政府公开信息，可以存放在仓库中。

---

## 附录 C：历史文本 URL（全部实测可访问，且含 `id="article"`）

前缀 `https://www.federalreserve.gov/newsevents/pressreleases/monetary`，后缀 `.htm`：

`20081125b` QE1 宣布 · `20090318a` QE1 扩大 · `20101103a` QE2 · `20120913a` QE3 · `20121212a` QE3 加码 · `20131218a` 开始缩减购买 · `20141029a` 结束 QE3 · `20170920a` 开始缩表 · `20190731a` 提前结束缩表 · `20191011a` 宣布买短债 · `20200315a` 疫情 QE · `20200323a` 无限量 · `20230312a` BTFP · `20251029a` 宣布停止缩表 · `20251210a` FOMC 声明 · `20251210a1` RMP 实施细则

---

## 附录 D：文本分类期望（`FedTextClassifierTest`）

2026-11-22 用 §3.3 的正则（含 `shorter-term` 与 `preferred no change` 两条补充规则）对真实页面逐一实测，下表的“实测类别”就是**完整**输出。测试应断言类别集合与该列**完全相等**。

| fixture | 实测类别 | 关键命中句（节选） |
|---|---|---|
| `fed-20081125b.html` | `QE_PURCHASE` | “…will initiate a program to purchase the direct obligations of housing-related government-sponsored enterprises…” |
| `fed-20090318a.html` | `QE_PURCHASE`、`EMERGENCY` | “…decided today to increase the size of the Federal Reserve's balance sheet further…”；“…Term Asset-Backed Securities Loan Facility…” |
| `fed-20101103a.html` | `QE_PURCHASE` | “…intends to purchase a further $600 billion of longer-term Treasury securities…” |
| `fed-20120913a.html` | `QE_PURCHASE` | 每月 400 亿美元购买 MBS |
| `fed-20121212a.html` | `QE_PURCHASE` | 加码购买长期国债 |
| `fed-20131218a.html` | `TAPER` | 放缓购买速度 |
| `fed-20141029a.html` | `TAPER` | “…decided to conclude its asset purchase program this month.” |
| `fed-20170920a.html` | `QT` | “…will initiate the balance sheet normalization program…” |
| `fed-20190731a.html` | `QT_END`、`CUT` | “…will conclude the reduction of its aggregate securities holdings…in August…” |
| `fed-20191011a.html` | `RMP` | 购买短期国债，“to ensure that the supply of reserves remains ample” |
| `fed-20200315a.html` | `QE_PURCHASE`、`EMERGENCY`、`CUT`、`DISSENT_EASE` | “…increase its holdings of Treasury securities by at least $500 billion and its holdings of agency mortgage-backed securities by at least $200 billion.”；“…expanded its overnight and term repurchase agreement operations.” |
| `fed-20200323a.html` | `QE_PURCHASE`、`EMERGENCY` | “…continue to purchase Treasury securities and agency mortgage-backed securities in the amounts needed to support smooth market functioning…” |
| `fed-20230312a.html` | `EMERGENCY` | “…make available additional funding to eligible depository institutions…” |
| `fed-20251029a.html` | `QT_END`、`CUT`、`DISSENT_EASE` | “The Committee decided to conclude the reduction of its aggregate securities holdings on December 1.” |
| `fed-20251210a.html` | `RMP`、`CUT`、`DISSENT_EASE`、`DISSENT_TIGHTEN` | “…will initiate purchases of shorter-term Treasury securities as needed to maintain an ample supply of reserves…”；“Schmid, who preferred no change…”（本次降息，所以算偏鹰异议） |
| `fed-20251210a1.html` | `RMP` | “Increase the System Open Market Account holdings of securities through purchases of Treasury bills…” |
| `fed-20261028a.html` | `DISSENT_TIGHTEN` | “…who preferred to raise the target range…”。“continuing its policy of maintaining ample reserves” 没有购买动作，**不算** RMP |
| `fed-20261028a1.html` | `RMP` | “When appropriate, increase the System Open Market Account holdings of securities through purchases of Treasury bills…” |

关键反例（必须保证**不出现** `QE_PURCHASE`）：`20191011a`、`20251210a`、`20251210a1`、`20261028a1`。这几份都是买短债，不是 QE。

> 如果联储以后修改了历史页面，导致 fixture 与上表不一致，以提交到仓库的 fixture 为准调整期望，并在交付说明中列出。