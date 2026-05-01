# A Stock Stock Card - Frontend

## 本地启动

```bash
npm install
npm run dev
```

默认地址: `http://localhost:5173`

## 一键启动前后端（Windows）

在项目根目录提供了以下脚本:

- `start-dev.ps1`: 一键启动后端 + 前端
- `start-dev.cmd`: 双击可启动（底层调用 `start-dev.ps1`）
- `stop-dev.ps1`: 按端口停止开发服务

### 使用方式

在项目根目录执行:

```powershell
.\start-dev.ps1
```

自定义后端端口（前端会自动适配）:

```powershell
.\start-dev.ps1 -BackendPort 8085
```

同时自定义前端端口:

```powershell
.\start-dev.ps1 -BackendPort 8085 -FrontendPort 5176
```

停止服务（默认停止 5173 和 8080）:

```powershell
.\stop-dev.ps1
```

按指定端口停止:

```powershell
.\stop-dev.ps1 -Ports 5176,8085
```

### 动态端口适配说明

1. 前端 API 改为请求 `/api`。
2. Vite 开发代理会读取环境变量 `BACKEND_PORT` 并转发到对应后端端口。
3. `start-dev.ps1` 会把你设置的 `BackendPort` 同步给:
  - 后端 `server.port`
  - 前端代理目标端口
4. 因此你只改一次 `BackendPort`，前后端会自动对齐。

## 公司信息 JSON 导入模板

在 `公司信息 -> 编辑视图 -> JSON 导入` 中点击按钮，会弹出导入对话框；在对话框中粘贴 JSON，可自动回填字段。

支持两种结构:

1. 平铺结构
2. `companyProfile` 嵌套结构

### 模板（平铺）

```json
{
  "business": "主营业务、业务结构、业务变化",
  "customers": "核心客户、客户集中度、议价能力",
  "competitors": "主要竞争对手与市场格局",
  "strengths": "竞争优势，例如护城河、成本优势、渠道能力",
  "structuralWeaknesses": "结构性弱点，例如商业模式脆弱点",
  "founderCeoHolding": "创始人/CEO 背景与持股控制权",
  "future": "面向未来，公司在做什么以顺应未来变化",
  "notes": "补充备注"
}
```

### 模板（嵌套）

```json
{
  "companyProfile": {
    "business": "...",
    "customers": "...",
    "competitors": "...",
    "strengths": "...",
    "structuralWeaknesses": "...",
    "founderCeoHolding": "...",
    "future": "...",
    "notes": "..."
  }
}
```

### 中文键名也支持

导入器同时支持中文键名:

- `业务`
- `客户`
- `竞争对手`
- `竞争优势`
- `结构性弱点`
- `面向未来`
- `创始人CEO及持股`
- `补充备注` 或 `备注`

### 导入规则

1. 仅覆盖 JSON 中出现的字段。
2. JSON 未提供的字段保持当前编辑内容不变。
3. 导入时若字段文本包含 `;`、`；`、`。`、`:`、`：`，系统会在这些符号后自动换行（英文句号 `.` 不换行）。
4. 若 JSON 语法错误，界面会显示解析失败提示。
