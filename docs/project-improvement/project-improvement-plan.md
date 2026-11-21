# 项目改进评估与优化路线图

> 评估日期：2026-11-01
> 评估范围：`backend/`（Spring Boot）、`frontend/`（React + Vite）、`scripts/`、启动/构建脚本、文档与工程化
> 使用方式：每一项都有编号（如 `S1`、`F3`），后续我们按 [第 9 节路线图](#9-分阶段优化路线图) 逐项推进，并在 [第 10 节追踪表](#10-进度追踪表) 中更新状态。

---

## 1. 现状快照

| 维度 | 现状 |
|------|------|
| 后端 | Spring Boot 3.2.5 / Java 17 / JPA + H2 文件库，约 70 个 Java 文件、14 个 Controller、11 个 Service |
| 前端 | React 19 + TypeScript 6 + Vite 8，约 45 个源文件，无路由库，无状态管理库 |
| 最大文件 | `ValuationModule.tsx` 1363 行、`DocumentCenterModal.tsx` 680 行、`IdeaModule.tsx` 654 行、`App.css` **7033 行** |
| 类型检查 | `tsc -b` ✅ 通过 |
| ESLint | ❌ **46 个问题（44 error / 2 warning）**，主要是 `react-hooks/set-state-in-effect`(21)、`react-hooks/refs`(12) |
| 构建产物 | 单个 JS chunk **1.34 MB（gzip 400 KB）**，Vite 报大 chunk 警告 |
| 自动化测试 | ❌ 前后端均为 **0 个测试** |
| CI | ❌ 无 `.github/workflows` |
| 部署形态 | 单用户本地应用；prod 模式单端口（Spring 托管前端 dist） |

**总体评价**：功能丰富、模块划分直观、Service 层已有一定抽象（如 `StockService` 的时间线审计、`GlobalExceptionHandler` 统一错误格式、`@EntityGraph` 防 N+1），说明已经做过一轮重构。主要短板集中在 **安全配置、测试/CI 缺失、前端大组件与打包体积、数据库演进与备份** 四个方面。

---

## 2. 安全（优先级最高）

### S1 🔴 API Key 硬编码在代码中，且已进入 Git 历史
- 位置：[application.properties](../../backend/src/main/resources/application.properties#L28-L29)、[StockLookupService.java](../../backend/src/main/java/com/stockcard/service/StockLookupService.java#L40)
- 问题：`TWELVEDATA_API_KEY`、`EASTMONEY_TOKEN` 以"默认值"形式写死，且已出现在历史提交中（如 `1940d53`）。仓库一旦公开或共享，Key 即泄露。
- 建议：
  1. **先到服务商后台轮换（作废）旧 Key**——这是唯一真正有效的补救；
  2. 删除默认值，改为 `${TWELVEDATA_API_KEY:}`，缺失时功能降级并打日志；
  3. 补全 `.env.example`（见 E2）；
  4. 可选：用 `git filter-repo` 清理历史（需协调所有克隆）。

### S2 🔴 `/api/config` 接口返回明文 API Key
- 位置：[ConfigController.java](../../backend/src/main/java/com/stockcard/controller/ConfigController.java#L27-L34)
- 问题：同时返回 `twelvedataApiKeyMasked` 和完整的 `twelvedataApiKey`，掩码形同虚设。
- 建议：GET 只返回掩码值 + `configured: true/false`；前端编辑时只提交新值。

### S3 🔴 外部请求关闭了 TLS 证书校验
- 位置：[StockLookupService.fetchJsonSkipSsl](../../backend/src/main/java/com/stockcard/service/StockLookupService.java#L60-L73)（用于 Twelve Data 请求，且请求中携带 API Key）
- 问题：自定义 `X509TrustManager` 信任所有证书，存在中间人攻击风险，Key 可被截获。
- 建议：删除该方法，改用默认 TLS；若公司网络有代理证书，应把代理 CA 导入 JVM truststore（或通过 `javax.net.ssl.trustStore` 指定），而不是关闭校验。

### S4 🟠 prod 模式对局域网暴露，且无认证 + H2 Console 开启
- 位置：[application.properties](../../backend/src/main/resources/application.properties#L14)（`spring.h2.console.enabled=true`）、[start-prod.ps1](../../start-prod.ps1#L142-L146)（未设置 `server.address`）
- 问题：Spring 默认绑定 `0.0.0.0`，同一网络内任何人都能读写全部数据；H2 Console 使用默认账号 `sa`/空密码，可直接执行 SQL。
- 建议：
  - 增加 `server.address=127.0.0.1`（如确需局域网访问再显式放开并加认证）；
  - 拆分 Spring Profile：`dev` 开 H2 Console，`prod` 关闭；
  - 若未来需要多设备访问，引入 Spring Security（最简单的 Basic Auth / 单用户密码即可）。

### S5 🟡 CORS 配置与属性脱节
- 位置：[CorsConfig.java](../../backend/src/main/java/com/stockcard/config/CorsConfig.java#L20)
- 问题：`app.cors.allowed-origins` 属性定义了却未被使用；代码对 `localhost:*` 全端口 + `allowCredentials(true)` 放行。由于 dev 走 Vite 代理、prod 同源，CORS 实际上基本不需要。
- 建议：读取配置属性，或在 prod profile 中直接不注册 CORS。

### S6 🟡 请求体大小无上限
- 位置：[application.properties](../../backend/src/main/resources/application.properties#L22-L25)（`max-swallow-size=-1`、`max-http-form-post-size=-1`）
- 问题：根源是编辑器把图片以 base64 内嵌到 HTML（见 F8），导致必须放开限制。
- 建议：图片统一走 `/api/images` 上传后，把上限收紧到合理值（如 20MB）。

### S7 ⚪ 打印/导出使用 `document.write` 写入用户 HTML
- 位置：[printExport.ts](../../frontend/src/printExport.ts#L128)、[IndustryChainModal.tsx](../../frontend/src/IndustryChainModal.tsx#L68)
- 说明：单用户本地场景风险低；但若将来支持导入他人文档/多用户，需引入 `DOMPurify` 做净化。

---

## 3. 数据可靠性与数据库演进

### D1 🟠 依赖 `ddl-auto=update`，没有版本化迁移
- 位置：[application.properties](../../backend/src/main/resources/application.properties#L12)、[StockClassifierApplication.java](../../backend/src/main/java/com/stockcard/StockClassifierApplication.java#L15-L24)
- 问题：`update` 不会删除/重命名列，无法做数据迁移，历史遗留字段（如 `Stock.strengthsWeaknessesLegacy`）会一直存在；每次启动都 `findAll()` 跑一遍 `migrateMarket`。
- 建议：引入 **Flyway**，以当前库结构作为 `V1__baseline.sql`，之后 `ddl-auto=validate`；一次性迁移脚本写成 SQL 迁移而非启动钩子。

### D2 🟠 没有备份机制，且数据库文件位于 OneDrive 同步目录
- 位置：[.gitignore](../../.gitignore#L13-L15) 注释说明 `backend/data` 通过 Junction 链接到 OneDrive
- 问题：H2 运行中文件被同步软件读写，存在损坏/冲突副本风险；没有任何备份/导出脚本。投资研究笔记是核心资产。
- 建议：
  - 新增 `backup-db.ps1`：使用 H2 `BACKUP TO 'xxx.zip'` 或 `SCRIPT TO` 生成带时间戳的备份，保留最近 N 份；
  - 或在应用内加一个 `@Scheduled` 每日备份；
  - OneDrive 中只放备份文件，活动库放本地目录。

### D3 🟡 二进制内容全部存数据库
- 图片（`StockImage`）、附件（`IdeaAttachment`）以 BLOB 存于 H2，文档 HTML 里还有 base64 图片。
- 影响：库文件膨胀、备份变慢、`findAll` 类查询加载大字段。
- 建议：短期统一走 `/api/images`（F8）；中期可考虑把附件落到文件系统 `data/files/`，库里只存路径。

### D4 ⚪ 删除级联靠手工维护
- 位置：[StockService.delete](../../backend/src/main/java/com/stockcard/service/StockService.java)
- 说明：新增关联表时容易漏删。可在 Flyway 迁移中加外键 `ON DELETE CASCADE`，或用测试覆盖（见 T1）。

---

## 4. 后端架构与代码质量

### B1 🟠 分层不一致
- `ConfigController` 被 `StockLookupService` 注入使用（Service 依赖 Controller，方向反了）→ 抽出 `AppConfigService`。
- `ValuationController`、`EarningsCalendarController`、`ConfigController` 直接操作 Repository，且 `ValuationController` 用字段 `@Autowired` → 统一为 Controller → Service → Repository + 构造器注入。

### B2 🟠 直接用 Entity 作为请求体，缺少输入校验
- 位置：[StockController.createStock](../../backend/src/main/java/com/stockcard/controller/StockController.java#L29-L31)、[ValuationController.update](../../backend/src/main/java/com/stockcard/controller/ValuationController.java#L39-L49)
- 问题：客户端可以直接提交 `id`、`archived`、`categories` 等不应由其设置的字段（mass assignment）；`GlobalExceptionHandler` 处理了 `MethodArgumentNotValidException`，但 **pom 中没有 `spring-boot-starter-validation`**，各处靠手写 `isBlank` 判断。
- 建议：引入 `spring-boot-starter-validation`，为写操作定义 Request DTO（Java `record` + `@NotBlank`/`@Size`/`@Min/@Max`）；Idea/Trade 已有 DTO，可作为模板推广。

### B3 🟡 Idea / Trade / Research 模块高度重复
- `IdeaController`/`TradeController` 的 Category CRUD、Payload、Dto、搜索、评分逻辑几乎一致（Idea 多了归档/附件/评论）。
- 建议：抽取通用的"分类 + 条目 + 评分 + 搜索"基础 Service/Controller，或至少抽公共 DTO 映射工具，降低后续维护成本。

### B4 🟡 外部 HTTP 调用缺少超时与统一封装
- 位置：[StockLookupService](../../backend/src/main/java/com/stockcard/service/StockLookupService.java#L37)（`new RestTemplate()` 无超时）、`fetchJsonSkipSsl` 每次新建 `HttpClient`
- 问题：外部 API 卡住会拖住 Tomcat 线程。
- 建议：统一使用 Spring 6.1 的 `RestClient`，配置连接/读取超时，作为 Bean 注入；`EarningsCalendarService` 已有超时设置，可以对齐。

### B5 🟡 SSE 线程池无界、无超时、无关闭
- 位置：[EarningsCalendarController](../../backend/src/main/java/com/stockcard/controller/EarningsCalendarController.java#L26-L36)
- 问题：`Executors.newCachedThreadPool()` 无上限；`new SseEmitter(0L)` 永不超时；应用关闭时不会 shutdown。
- 建议：使用 Spring 管理的 `ThreadPoolTaskExecutor`（限定大小）；为 Emitter 设置合理超时并注册 `onTimeout/onError` 回调。

### B6 🟡 错误处理与日志不一致
- `StockLookupService` 使用 `java.util.logging`，其余用 SLF4J → 统一 SLF4J。
- 多处 `catch (Exception e)` 后把 `e.getMessage()` 拼进响应（"查询失败: ..."），既吞掉堆栈又可能暴露内部信息 → 记录日志 + 返回友好消息。
- `LocalDate.parse` 解析失败抛 `DateTimeParseException`，目前落入通用 500 → 在 `GlobalExceptionHandler` 中归为 400。
- 409 等错误响应体为空，前端无法显示原因 → 抛业务异常，由全局处理器返回 `{message}`。
- 访问不存在的路径（如 prod 下的 `/h2-console`）时，`NoResourceFoundException` 被通用处理器捕获，返回 **500** 而非 404 → 增加对应处理。

### B7 🟡 搜索实现细节
- 位置：[StockRepository.searchByFieldsOrIds](../../backend/src/main/java/com/stockcard/repository/StockRepository.java#L36-L42)
- 问题：
  - 未包含 `industry_position` 字段（但它在编辑时会被记录到时间线）；
  - 用户输入中的 `%`、`_` 未转义，会被当作通配符；
  - 多个 CLOB 字段 `LOWER(...) LIKE` 全表扫描，数据量大时会变慢。
- 建议：补字段 + 转义；中长期可启用 H2 全文索引（`FT_INIT`）或 Lucene。

### B8 ⚪ HTTP 语义不统一
- 删除接口有的返回 `200`、有的返回 `204`；归档用 `PATCH /archive` 与 `/unarchive` 两个端点。可在引入 OpenAPI（见 E4）时统一规范。

### B9 🟡 依赖版本
- Spring Boot 3.2.x 已结束 OSS 支持，建议升级到当前受支持版本（先升 3.5.x，再评估 4.x）。升级前需要先有测试兜底（T1）。

### B10 ⚪ 列表接口返回完整大字段
- `GET /api/stocks` 返回每只股票的全部 CLOB（业务、客户、竞争对手……），而列表页只用到少数字段。
- `ValuationController.getCompanies` 加载全部快照后在内存去重。
- 建议：列表用投影/摘要 DTO，详情再取全量；`getCompanies` 改为 `SELECT DISTINCT` 查询。

---

## 5. 前端架构与代码质量

### F1 🟠 ESLint 44 个 error 未处理，Lint 未作为门禁
- 分布：`MarkdownEditor.tsx`(12)、`ResearchModule.tsx`(6)、`EarningsCalendarModule.tsx`(5)、`IdeaModule.tsx`(5)、`TradeModule.tsx`(4) 等。
- 主要规则：`set-state-in-effect`（在 effect 中同步 setState 导致级联渲染）、`refs`（渲染期间读写 ref）。
- 建议：逐文件修复；把 `npm run lint` 纳入 `build-prod` 与 CI。

### F2 🟠 巨型组件与巨型样式表
- `ValuationModule.tsx` 1363 行；`App.tsx` 内有约 40 个 `useState`，集中管理分类/筛选/弹窗/编辑等全部状态。
- `App.css` 7033 行全局样式，类名冲突与死样式难以排查。
- 建议：
  - 按"容器 + 展示组件 + 自定义 Hook"拆分（如 `useStockFilters`、`useCategoryManager`）；
  - 目录按功能组织：`src/features/stocks/`、`src/features/ideas/`、`src/shared/components/`……；
  - 样式逐步迁移到 CSS Modules（每个组件一个 `.module.css`），新代码先行。

### F3 🟠 无路由、无代码分割，首屏包 1.34 MB
- 位置：[Root.tsx](../../frontend/src/Root.tsx#L16-L49)
- 问题：模块切换靠 `localStorage` + `if` 判断，**浏览器后退/前进、链接分享、刷新定位到某条记录** 都不支持；所有模块（含 Tiptap、KaTeX）打进同一个 chunk。
- 建议：
  - 引入 `react-router`，每个模块一个路由（`/stocks`、`/ideas/:id` …）；
  - 路由级 `React.lazy` + `Suspense` 懒加载；
  - 在 Vite 构建配置中把 tiptap、katex、markdown 拆成独立 vendor chunk。
- 预期：首屏 JS 显著下降（目标 gzip < 200 KB）。

### F4 🟡 数据获取方式原始，存在竞态
- 例：[App.tsx](../../frontend/src/App.tsx#L111-L145) 的筛选 effect 没有取消机制，快速输入搜索时旧请求可能晚于新请求返回并覆盖结果。
- 建议：引入 **TanStack Query**（缓存、去重、取消、失效刷新、loading/error 状态一站式解决），可大幅删减各模块的手写 `loading`/`useEffect` 代码。

### F5 🟡 依赖冗余
- `@uiw/react-md-editor` 在源码中**未被引用**，可直接移除。
- Markdown 渲染同时使用 `marked`（转 HTML）与 `react-markdown`（组件渲染）两套方案 → 统一为一套，减少体积与行为差异。

### F6 🟡 交互反馈不统一
- 共 20+ 处 `window.confirm` / `alert`；不少错误只 `console.error`，用户无感知（如 `App.tsx` 的 `loadData`）。
- 建议：实现统一的 `ConfirmDialog` 与 `Toast` 组件，配合 `getErrorMessage` 展示后端返回的 `message`。

### F7 🟡 前后端类型手工同步
- [api.ts](../../frontend/src/api.ts) 手写全部接口类型（454 行），后端改字段时容易漏改。
- 建议：后端引入 `springdoc-openapi`，前端用 `openapi-typescript` 生成类型（同时获得 Swagger UI 文档）。

### F8 🟡 粘贴图片以 base64 内嵌
- 位置：[DocEditor.tsx](../../frontend/src/DocEditor.tsx#L255)
- 问题：文档 HTML 体积暴增，搜索 `LIKE` 也会扫描这些 base64 内容；后端已提供 `/api/images` 上传接口，`DocumentCenterModal` 中也有把 data URL 转上传的逻辑，但未统一。
- 建议：编辑器粘贴/拖拽时直接上传，内容只保存 `/api/images/{id}`；写一次性迁移把存量 base64 转存。

### F9 ⚪ 可访问性与细节
- 弹窗缺少焦点陷阱、`aria-modal`、`role="dialog"`；可考虑使用原生 `<dialog>` 或成熟的无样式组件库（Radix UI）。
- [DocEditor.tsx](../../frontend/src/DocEditor.tsx#L15) 存在 `any` 类型。

---

## 6. 测试与质量保障

### T1 🔴 后端测试从零建立
- 优先覆盖有业务规则的地方：
  - `StockService`：更新时变更字段识别与时间线记录、交集/并集筛选、搜索（含文档/日志命中）、删除级联；
  - `IdeaService` / `TradeService`：分类有数据时禁止删除（409）；
  - Controller 层：用 `@WebMvcTest` 校验参数错误返回 400。
- H2 本身就是嵌入式库，`@DataJpaTest` 开箱即用，成本很低。

### T2 🟠 前端测试
- 引入 **Vitest + Testing Library**，从纯函数开始：[stockFilters.ts](../../frontend/src/stockFilters.ts)、[timelineUtils.ts](../../frontend/src/timelineUtils.ts)、[markdownUtils.ts](../../frontend/src/markdownUtils.ts)；
- 再对关键交互（新增股票、分类筛选）写组件测试；
- 可选：Playwright 冒烟测试，跑通 prod 单端口启动后的主流程。

### T3 🟠 CI 流水线
- 新增 GitHub Actions：
  - backend：`mvn -B verify`
  - frontend：`npm ci && npm run lint && npm run build && npm test`
- 配合 Dependabot/Renovate 自动升级依赖。

---

## 7. 工程化与文档

### E1 🟡 README 过时且内容错位
- [README.md](../../README.md) 写的是 "React 18"（实际 19）；大量篇幅是 `DocEditor.tsx` 的旧版源码拷贝（已与当前实现不一致）；缺少：项目简介/截图、快速开始、目录结构、环境变量、dev/prod 启动方式、数据备份说明。
- 建议：README 聚焦"是什么 + 怎么跑"；JSON 导入格式、编辑器实现等迁移到 `docs/` 下独立文档。

### E2 🟡 `.env.example` 不完整
- 目前只有 `FMP_API_KEY`，缺少 `TWELVEDATA_API_KEY`、`EASTMONEY_TOKEN`、`DB_USERNAME`/`DB_PASSWORD`、`BACKEND_PORT` 等。

### E3 🟡 配置分环境
- 使用 `application-dev.properties` / `application-prod.properties`，由启动脚本传 `--spring.profiles.active=prod`；把 H2 Console、DevTools、CORS、`server.address` 等差异收敛到 profile 中。

### E4 ⚪ API 文档
- 引入 `springdoc-openapi`，自动生成 Swagger UI（与 F7 共用）。

### E5 ⚪ 代码风格统一
- 前端加 Prettier；后端加 Spotless（google-java-format 或 palantir）；根目录加 `.editorconfig`。

### E6 ⚪ 提交规范
- 近期提交信息多为 `commit`、`chore: sync from ...`，难以回溯。建议采用 Conventional Commits（`feat:`/`fix:`/`refactor:`），并以小步提交为主。

### E7 ⚪ 脚本说明
- `scripts/` 下有两个估值抓取脚本：`fetch-valuations.mjs`（FMP API）与 `fetch_valuations.py`（stockanalysis.com 抓取），数据源不同但输出格式相同，建议在 `scripts/README.md` 中说明各自适用场景，或保留一个。

---

## 8. 产品功能层面的提升建议（可选）

以下不是缺陷，而是基于现有模块的增值方向，供后续讨论：

1. **全局搜索 / 命令面板**（`Ctrl+K`）：跨股票、研报、Idea、交易、日历统一搜索并跳转（依赖 F3 路由）。
2. **数据导入导出**：一键导出全部数据为 JSON/Markdown 压缩包，既是备份也便于迁移（配合 D2）。
3. **行情数据联动**：在股票卡片上显示最新价格、估值分位，与 `ValuationModule` 打通。
4. **标签/分类统计看板**：按分类、研究价值星级、市场统计股票分布与近期活跃度（时间线数据已具备）。
5. **提醒能力**：财报日历、市场事件临近时在首页提醒。

---

## 9. 分阶段优化路线图

> 原则：**先止血（安全）→ 再建安全网（测试/CI）→ 然后重构 → 最后做性能与体验**。每个阶段结束都应保持可运行、可回滚。

### 阶段 0：安全止血（约 0.5 天）
| 编号 | 事项 |
|------|------|
| S1 | 轮换 API Key，移除代码中的默认值，补全 `.env.example`（E2） |
| S2 | `/api/config` 不再返回明文 Key |
| S3 | 删除"信任所有证书"的请求方式 |
| S4 | `server.address=127.0.0.1`，prod 关闭 H2 Console |

### 阶段 1：建立质量基线（约 1–2 天）
| 编号 | 事项 |
|------|------|
| T1 | 后端核心 Service 测试（StockService 优先） |
| T2 | 前端 Vitest + 纯函数测试 |
| F1 | 修复 44 个 ESLint error |
| T3 | GitHub Actions：lint + build + test |
| D2 | 数据库备份脚本 |

### 阶段 2：后端加固（约 2–3 天）
| 编号 | 事项 |
|------|------|
| E3 | 拆分 dev/prod Profile |
| B2 | Request DTO + Bean Validation |
| B1 | 分层规整（抽 `AppConfigService` 等） |
| B4 / B5 | `RestClient` + 超时；SSE 线程池治理 |
| B6 | 统一日志与异常处理 |
| D1 | 引入 Flyway，`ddl-auto=validate` |
| B7 | 搜索字段补全与通配符转义 |

### 阶段 3：前端重构（约 3–5 天）
| 编号 | 事项 |
|------|------|
| F5 | 移除未用依赖，统一 Markdown 方案 |
| F3 | 引入路由 + 懒加载 + 分包 |
| F4 | 引入 TanStack Query |
| F6 | 统一 Toast / ConfirmDialog |
| F2 | 拆分大组件、按功能组织目录、样式模块化 |
| F8 | 图片统一上传 + 存量迁移 |

### 阶段 4：持续演进（按需）
| 编号 | 事项 |
|------|------|
| B9 | 升级 Spring Boot |
| B3 | 抽象 Idea/Trade 等重复模块 |
| F7 / E4 | OpenAPI 文档与类型生成 |
| B10 / D3 | 列表摘要 DTO、附件落盘 |
| E1 / E5 / E6 / E7 | 文档、代码风格、提交规范 |
| 第 8 节 | 产品功能增强 |

---

## 10. 进度追踪表

状态：⬜ 未开始 ／ 🔄 进行中 ／ ✅ 完成 ／ ⏸ 暂缓

| 编号 | 标题 | 优先级 | 阶段 | 状态 |
|------|------|--------|------|------|
| S1 | API Key 移出代码并轮换 | 🔴 | 0 | 🔄 代码已完成；待你在 Twelve Data 后台轮换 Key |
| S2 | `/api/config` 不返回明文 Key | 🔴 | 0 | ✅ |
| S3 | 移除关闭 TLS 校验的请求 | 🔴 | 0 | ✅ |
| S4 | 仅本机监听 + prod 关闭 H2 Console | 🟠 | 0 | ✅ |
| S5 | CORS 配置收敛 | 🟡 | 2 | ✅ 仅 dev profile，读取配置 |
| S6 | 收紧请求体上限 | 🟡 | 3 | ✅ JSON 10MB / 上传 20MB |
| S7 | 导出 HTML 净化 | ⚪ | 4 | ⬜ |
| D1 | Flyway 迁移 | 🟠 | 2 | ✅ V1 基线 + V2；已用真实库副本验证 |
| D2 | 数据库备份 | 🟠 | 1 | ✅ |
| D3 | 二进制内容存储优化 | 🟡 | 4 | ⬜ |
| D4 | 删除级联 | ⚪ | 2 | ⬜ |
| B1 | 分层规整 | 🟠 | 2 | ✅ |
| B2 | DTO + 校验 | 🟠 | 2 | ✅ 核心写接口；研报/产业链/日历/技术周期待补 |
| B3 | 重复模块抽象 | 🟡 | 4 | ⬜ |
| B4 | HTTP 客户端超时 | 🟡 | 2 | ✅ |
| B5 | SSE 线程池治理 | 🟡 | 2 | ✅ |
| B6 | 日志与异常统一 | 🟡 | 2 | ✅ |
| B7 | 搜索修正 | 🟡 | 2 | ✅（全文索引留待数据量增大时） |
| B8 | HTTP 语义统一 | ⚪ | 4 | ⬜ |
| B9 | 升级 Spring Boot | 🟡 | 4 | ⬜ |
| B10 | 列表摘要 DTO | ⚪ | 4 | ⬜ |
| F1 | 修复 ESLint | 🟠 | 1 | ✅ 0 问题，未使用 eslint-disable |
| F2 | 拆分大组件 / 样式模块化 | 🟠 | 3 | 🔄 股票页、估值模块已拆分；其余模块与 App.css 逐步迁移 |
| F3 | 路由 + 懒加载 + 分包 | 🟠 | 3 | ✅ 首屏 JS gzip 400KB → 约 93KB |
| F4 | TanStack Query | 🟡 | 3 | ✅ 股票列表、分类、时间线、估值；其余模块待迁移 |
| F5 | 清理冗余依赖 | 🟡 | 3 | ✅ |
| F6 | Toast / ConfirmDialog | 🟡 | 3 | ✅ 已无 window.alert / confirm |
| F7 | OpenAPI 类型生成 | 🟡 | 4 | ⬜ |
| F8 | 图片统一上传 | 🟡 | 3 | ✅ 含存量迁移 V3 |
| F9 | 可访问性 | ⚪ | 4 | ⬜ |
| T1 | 后端测试 | 🔴 | 1 | ✅ 66 个测试（持续补充） |
| T2 | 前端测试 | 🟠 | 1 | ✅ 71 个测试（含 hook / 组件测试，jsdom） |
| T3 | CI | 🟠 | 1 | ✅ GitHub Actions + Dependabot |
| E1 | README 重写 | 🟡 | 4 | ⬜ |
| E2 | `.env.example` 补全 | 🟡 | 0 | ✅ |
| E3 | 分环境配置 | 🟡 | 2 | ✅ dev：H2 Console + CORS |
| E4 | API 文档 | ⚪ | 4 | ⬜ |
| E5 | 代码风格工具 | ⚪ | 4 | ⬜ |
| E6 | 提交规范 | ⚪ | 4 | ⬜ |
| E7 | 脚本说明 | ⚪ | 4 | ⬜ |

---

## 11. 变更记录

### 2026-11-01 · 阶段 0：安全止血

| 编号 | 改动 | 涉及文件 |
|------|------|----------|
| S1 | 删除 `TWELVEDATA_API_KEY` / `EASTMONEY_TOKEN` 的硬编码默认值；后端通过 `spring.config.import` 自动读取根目录 `.env`（dev/prod/IDE 启动均生效），真实环境变量优先 | `application.properties`、`StockLookupService.java` |
| S2 | `GET /api/config` 只返回 `configured` / `masked` / `source`（DATABASE / ENVIRONMENT / NONE）；`PUT` 传空值表示清除界面保存的 Key；首页设置面板改为密码框 + 显示掩码与来源，输入为空时不允许保存，新增「清除已保存」按钮 | `ConfigController.java`、`AppConfigService.java`（新）、`api.ts`、`HomePage.tsx` |
| S3 | 删除"信任所有证书"的 `fetchJsonSkipSsl`，Twelve Data 请求改用默认 TLS（已实测可正常返回） | `StockLookupService.java` |
| S4 | `server.address` 默认 `127.0.0.1`（可用 `SERVER_ADDRESS` 覆盖）；H2 Console 默认关闭，仅 `dev` profile 开启；`start-dev` 中 Vite 改为只监听本机；两个启动脚本新增 `-Lan` 开关用于显式开放局域网；Vite 代理目标改为 `127.0.0.1` | `application.properties`、`application-dev.properties`（新）、`start-dev.ps1`、`start-prod.ps1`、`vite.config.ts` |
| B1（部分） | Key 解析逻辑从 `ConfigController` 移到 `AppConfigService`，`StockLookupService` 不再依赖 Controller | 同上 |
| E2 | `.env.example` 补全所有变量及说明；README 增加「配置与启动」 | `.env.example`、`README.md` |

**验证**：后端打包通过；以临时数据库启动验证——仅监听 `127.0.0.1`、局域网 IP 访问被拒；配置接口不再含明文；保存/清除 Key 流程正确；EastMoney 与 Twelve Data 查询正常；默认 profile 下 H2 Console 不可用，`dev` profile 下返回 200；`tsc -b` 与改动文件 ESLint 通过；首页设置面板界面检查正常。

**待你手动完成**：
1. 登录 Twelve Data 后台**作废并重新生成 API Key**，填入本地 `.env`（或首页设置面板）。旧 Key 已在 Git 历史中，仅删除代码无法撤回泄露。
2. EastMoney token 是东方财富网页端公开使用的 token，风险较低，已一并移入 `.env`。
3. 如果仓库曾经/将会公开，可考虑用 `git filter-repo` 清理历史中的旧 Key。
### 2026-11-01 · 阶段 1：建立质量基线

| 编号 | 改动 | 涉及文件 |
|------|------|----------|
| T1 | 新增 40 个后端测试：`StockService`（时间线审计、字段变更识别、归档、并/交集筛选、跨文档/日志/财报搜索、级联删除、归属校验）、Idea/Trade（分类唯一、有数据禁止删除、评分截断、文件夹归档/恢复联动）、`AppConfigService`、`ConfigController`（防明文 Key 回归）、`StockController`（参数校验 400/404）、全量上下文冒烟测试。全部使用内存/临时 H2，不触碰 `./data` | `backend/src/test/**` |
| T1（配套） | 启动数据修正 `migrateMarket` 从应用主类移到独立组件 `StartupDataMigrations`，使 `@WebMvcTest` 切片测试可独立运行 | `StockClassifierApplication.java`、`config/StartupDataMigrations.java` |
| T2 | 引入 Vitest 5，新增 `npm test` / `npm run test:watch`；21 个测试覆盖 `stockFilters`、`timelineUtils`、`markdownUtils`、`themes` | `frontend/package.json`、`frontend/src/*.test.ts` |
| F1 | 修复全部 46 个 ESLint 问题（无 `eslint-disable`，并移除了原有的 1 处）。主要模式：effect 中的同步 setState 改为 promise 回调或"渲染期依据前值调整 state"；`MarkdownEditor` 的 `btn()` 抽成 `ToolbarButton` 组件；`any` 改为 `NodeViewProps` | 14 个前端文件 |
| F1（行为修复） | **行业研报编辑模式下按 Esc 不再关闭弹窗**：原代码本意如此，但 effect 依赖缺少 `modalMode` 导致判断失效，可能丢失未保存内容 | `ResearchModule.tsx` |
| T3 | GitHub Actions：后端 `mvn verify`；前端 `npm ci → lint → test → build`。Dependabot 每周检查 npm/maven（minor/patch 分组），每月检查 Actions | `.github/workflows/ci.yml`、`.github/dependabot.yml` |
| D2 | `DatabaseBackupService`：H2 `BACKUP TO` 在线一致性备份；运行中每小时检查，超过 24 小时未备份则自动备份，保留最近 14 份；`GET/POST /api/admin/backups`；`backup-db.cmd` 脚本（运行中调接口，停止时直接打包，库文件被占用时拒绝复制）；README 补充备份/恢复说明 | `service/DatabaseBackupService.java`、`controller/BackupController.java`、`config/SchedulingConfig.java`、`backup-db.ps1/.cmd`、`application.properties` |

**验证**：`mvn test` 40/40 通过；`npm test` 21/21、`eslint .` 0 问题、`tsc -b`、`vite build` 均通过；`npm ci --dry-run` 确认 lockfile 同步；对运行中的 dev 实例执行 `backup-db` 成功生成含 `stockdb.mv.db` 的 zip；离线分支在库文件被占用时正确拒绝；浏览器逐一加载 10 个模块，无控制台错误。

**建议你在界面上手动回归**：
1. 行业研报：打开研报 → 切到编辑 → 按 Esc，应不关闭（新行为）。
2. Idea / 交易记录：输入搜索词后清空，结果应立即清除；切换文件夹时子分类筛选重置。
3. 财报日历：点刷新后仍会自动选中当月最近的有数据日期。
4. 新增股票弹窗：打开时表单重置，输入代码/名称时联想建议正常（250ms 防抖）。

**备注**：`npm install` 时 npm audit 报告了若干既有依赖漏洞提示，留待阶段 4 依赖升级（B9/Dependabot）统一处理。

### 2026-11-01 · 阶段 2：后端加固

| 编号 | 改动 | 涉及文件 |
|------|------|----------|
| B6 | 全局异常处理补全：未知路径 404（原为 500）、请求体格式错误 / 日期解析失败 / 参数校验失败 400（附字段名）、405/415、`ResponseStatusException` 透传、唯一键冲突 409（如重复分类名或股票代码，原为 500）、其他约束失败 400；统一 SLF4J，外部查询失败不再把异常原文返回给前端 | `GlobalExceptionHandler.java`、`StockLookupService.java`、`EarningsCalendarService.java` |
| B4 | 共享 `RestTemplate`（连接 5s / 读取 15s 超时，可配置 `app.http.*`）；Twelve Data Key 改走 `Authorization` 请求头，不再出现在 URL / 异常日志中 | `config/HttpClientConfig.java`、`StockLookupService.java` |
| B4（顺带修复） | **A 股按中文名称查询（如"茅台"）此前总是返回空**：URL 被二次编码。改为 `URI` 请求后已正常返回 | `StockLookupService.java` |
| B5 | 财报 SSE：无界线程池 → 2 线程有界池（随应用关闭），任务过多返回 429；Emitter 15 分钟超时；客户端断开时中止剩余抓取 | `EarningsCalendarController.java` |
| B1 | 新增 `ValuationService`、`EarningsNoteService`，Controller 不再直接操作 Repository；`/valuations/companies` 改为数据库去重查询（语义不变） | `service/ValuationService.java`、`service/EarningsNoteService.java`、相关 Controller / Repository |
| B2 | 引入 `spring-boot-starter-validation`；股票、文档、财报、分类改用请求 DTO（`dto/*Request`），**客户端无法再通过创建接口写入 `id`/`archived`/`categories`**；估值快照、Idea/交易记录加长度/必填约束 | `dto/*`、`StockController.java`、`CategoryController.java`、`ValuationSnapshot.java`、`IdeaController.java`、`TradeController.java` |
| B2（行为修正） | 更新股票时未提供 `market` 不再被重置为 CN（保留原值）；创建时缺省值改由 Service 统一设置 | `StockRequest.java`、`StockService.java` |
| B7 | 股票搜索补上「行业地位」字段；用户输入中的 `%`、`_` 按字面匹配（股票 / Idea / 交易记录）；关键字处理从 Controller 移到 Service | `SearchPatterns.java`、`StockRepository.java`、相关 Service |
| S5 / E3 | CORS 仅在 `dev` profile 生效并读取 `app.cors.allowed-origins`；prod 同源无需 CORS | `CorsConfig.java`、`application.properties`、`start-dev.ps1` |
| D1 | 引入 Flyway：`V1__baseline.sql`（由当前实体生成）+ `V2__default_stock_market.sql`（替代每次启动全表扫描的 `StartupDataMigrations`）；`ddl-auto=validate`；旧库自动 baseline 为 V1 | `db/migration/*`、`pom.xml`、`application.properties` |
| 前端修复 | **个股档案编辑保存会清空「推荐人」**（既有数据丢失 bug，回放前端请求时发现）：保存时带上表单未编辑的字段 | `ProfileModal.tsx` |

**验证**：
- `mvn package` 61/61 测试通过：每个测试上下文都通过 Flyway V1+V2 建库并由 Hibernate 校验，证明基线与实体一致。新增测试覆盖批量赋值防护、校验错误信息、409、404、日期 400、估值/笔记服务、搜索转义、dev 与非 dev 的 CORS。
- **真实库迁移演练**：先对运行中的库做在线备份，解压到临时目录，在旧 schema 上插入代表性数据（含 market 为 NULL 和空字符串的股票），再用新版本启动。结果：baseline=V1、仅执行 V2、Hibernate 校验通过、24 张表行数完全一致、两条异常 market 被修正为 CN。
- prod 模式（jar + dist）在迁移后的副本上逐一加载 10 个模块，无控制台错误、无失败的 API 请求；按前端实际请求体回放新增 / 更新股票（包括 App.tsx 发送的完整对象），结果符合预期。
- `npm run lint`、`tsc -b`、`npm test`、`vite build` 均通过。

**注意事项**：
1. 你当前运行的 dev 后端是在新依赖（Flyway、Validation）加入之前启动的，**请用 `start-dev.cmd` 重启一次**。首次启动时 Flyway 会把现有库标记为 V1 并执行 V2；启动前已有今天的在线备份（`backend/data/backups/`）。
2. 今后修改实体必须同时新增迁移脚本（见 README「数据库结构变更」）。
3. Flyway 9.22 提示"H2 2.2.224 比其测试过的版本新"，属提示性警告，随阶段 4 升级 Spring Boot 一并解决。
4. 本机 `backend/data` 是普通目录（并非 OneDrive Junction），库中目前没有数据；若真实数据在其他机器上，首次用新版本启动前，请先运行一次 `backup-db.cmd`。

### 2026-11-21 · 阶段 3：前端重构

| 编号 | 改动 | 涉及文件 |
|------|------|----------|
| F5 | 移除未使用的 `@uiw/react-md-editor` 及其样式；`react-markdown` + `remark-gfm` + `remark-breaks` 统一替换为 **marked + DOMPurify** 一套方案（`renderMarkdownSafe` 保持 GFM + 单换行即换行的原语义，且输出经过净化）；`markdownUtils.ts` 并入 `shared/markdown.ts` | `shared/markdown.ts`、`shared/MarkdownView.tsx`、`ProfileModal.tsx`、`IndustryChainModal.tsx`、`DocumentCenterModal.tsx`、`EarningsCalendarModule.tsx`、`DocEditor.tsx`、`printExport.ts`、`App.css` |
| F3 | 引入 `react-router`：每个模块一个 URL（`/stocks`、`/research`、`/techcycle`、`/ideas`、`/trades`、`/valuation`、`/calendar`、`/earnings-calendar`、`/archive`、`/archive/stocks\|reports\|ideas`），未知路径回首页；不再用 `localStorage.activeModule` 记录模块（启动时清理旧值）。所有模块 `React.lazy` 按需加载；Vite 分包 `vendor-react` / `vendor-tiptap` / `vendor-katex` / `vendor-markdown`；新版本发布后旧标签页加载失效 chunk 时自动刷新一次（`chunkReload.ts`） | `Root.tsx`、`main.tsx`、`app/*`、`ArchiveModule.tsx`、`HomePage.tsx`、`vite.config.ts` |
| F6 | 新增 `FeedbackProvider`（`useToast` / `useConfirm`，CSS Modules）。替换全部 28 处 `window.alert` / `window.confirm`；确认框为 `role="alertdialog"`，Esc / 点遮罩取消，Esc 不会同时关闭下层弹窗。原先只 `console.error` 的失败（股票页各操作、日志中心、档案保存、评分、拖拽移动研报、删除/归档等）改为 Toast 显示后端 `message`（`getErrorMessage`） | `shared/ui/feedback/*`、各模块 |
| F4 | 引入 TanStack Query。股票列表按筛选条件拆成独立 query key（全部 / 分类筛选 / 搜索 / 归档），**旧关键字的慢请求不会再覆盖新结果**，且被取代的请求会被 abort；写操作后统一更新缓存或失效重取。分类、时间线、估值数据同样改用 Query | `features/stocks/stockQueries.ts`、`features/stocks/useStockData.ts`、`api.ts`、`features/valuation/ValuationModule.tsx` |
| F2 | `App.tsx`（约 40 个 `useState`）迁移为 `features/stocks/StocksModule.tsx`，抽出 `useStockList` / `useStockCache` / `useCategories` / `useStockTimeline` / `useCategoryManager` / `useBasicInfoEditor` / `useDebouncedValue`。`ValuationModule.tsx` 1363 行 → 约 230 行容器 + 列表 / 对比 / 详情 / 表单 / 导入组件 + 纯函数 `valuationUtils.ts`（筛选、排序、导入校验与合并、模板）。新组件样式使用 CSS Modules；`App.css` 本阶段未做大改 | `features/stocks/*`、`features/valuation/*`、`shared/hooks/*` |
| F8 | 编辑器粘贴截图 / 拖入图片 → 立即上传 `/api/images`，正文只保存 `/api/images/{id}`；粘贴带 base64 图片的富文本（Word、网页）时先逐张上传再插入；上传失败 Toast 提示。Flyway Java 迁移 `V3__Extract_inline_images` 把存量 19 个富文本字段中的 base64 图片一次性转存到 `stock_images`（相同图片只存一份），日志中心保存前的兜底转换改用共享的 `replaceDataImages` | `DocEditor.tsx`、`shared/imageUpload.ts`、`DocumentCenterModal.tsx`、`backend/.../util/InlineImages.java`、`backend/.../db/migration/V3__Extract_inline_images.java` |
| S6 | 移除 `max-swallow-size=-1`、`max-http-form-post-size=-1`；新增 `RequestSizeLimitFilter`：非 multipart 请求体超过 `app.request.max-body-size`（10MB）返回 413 + 中文提示；multipart 单文件 20MB / 单请求 21MB（原 100MB） | `application.properties`、`config/RequestSizeLimitFilter.java` |
| 修复 | 直接打开没有主题选择器的模块（如 `/calendar`）时主题变量未生效、弹窗背景透明：启动时即应用已保存的主题 | `main.tsx` |
| 修复 | 编辑器连续粘贴两张图片时，第二次粘贴会替换掉刚插入的图片（插入后图片处于选中状态）：插入后光标移到图片之后 | `DocEditor.tsx` |

**体积**：首屏（首页）JS 由 1,339 KB / gzip 400 KB 降为 `index` 33 KB + `vendor-react` 261 KB（gzip 合计约 **93 KB**）；Tiptap（gzip 137 KB）、KaTeX（77 KB）、Markdown（24 KB）只在打开用到它们的模块时加载。

**行为变化（有意为之）**：
1. 每个模块都有独立 URL，浏览器前进/后退、刷新会停留在当前模块；归档中心的三个子视图也有各自 URL。
2. 股票页只对搜索关键字做 300ms 防抖，点选分类 / 切换并集交集立即生效（原先所有筛选都等 300ms）。
3. 删除 / 归档 / 放弃编辑的确认改为应用内对话框（危险操作按钮为红色），不再弹浏览器原生对话框。
4. 原先静默失败的操作现在会提示错误；新增股票时后端错误（如代码重复 409）直接显示在弹窗内。
5. 上传文件上限 100MB → 20MB（Idea 附件同样受限）；超过 10MB 的 JSON 请求返回 413。
6. 编辑器不再把图片以 base64 写入正文。

**验证**：
- 前端：`npm run lint` 0 问题（无 eslint-disable）、`tsc -b`、`npm test` **71/71**（新增 Feedback 组件、`useStockList` 竞态、`useDebouncedValue`、`stockQueries`、`valuationUtils`、`imageUpload` 等测试，jsdom 环境）、`npm run build` 通过。
- 后端：`mvn test` **66/66**（新增 `InlineImagesTest`、`V3ExtractInlineImagesTest`：在 V2 库中写入含 base64 的股票档案 / 日志后执行 V3，校验图片入库、正文改写、重复图片去重；`StockControllerTest` 新增 413 用例）。
- 隔离环境冒烟（独立端口 18085/15173 + 临时库，未触碰 dev 进程）：13 个路由（10 个模块 + 归档子视图）逐一打开，无控制台错误、无失败的 API 请求；验证了前进 / 后退 / 刷新 / 未知路径、股票搜索 / 分类并集 / 评分 / 时间线 / 归档与恢复 / 基本信息保存、交易记录删除确认（Esc 取消、409 Toast、确认删除）、日历弹窗上叠加确认框、估值排序 / 筛选 / 悬浮提示 / 对比高亮 / 编辑保存 / JSON 更新模式导入 / 删除、Idea 编辑器粘贴截图 ×2 + 粘贴含 base64 的 HTML + 拖入图片（保存后正文仅含 `/api/images/*`）、日志中心旧 Markdown 渲染；`curl` 验证 11MB JSON 与 21MB 文件均返回 413、小图片上传 200。

**注意事项**：
1. 本阶段新增 Flyway 迁移 V3，首次用新版本启动会扫描所有富文本字段并转存内嵌图片（数据量大时启动会稍慢一次）。启动前建议先运行一次 `backup-db.cmd`。
2. 依赖有变化，拉取后请在 `frontend/` 下执行 `npm ci`。
3. 仍待后续迁移：其余模块（Idea / 交易 / 研报 / 日历等）的数据请求改用 TanStack Query、大组件继续拆分、`App.css` 按组件拆为 CSS Modules。