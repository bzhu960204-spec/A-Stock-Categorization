# A Stock Stock Card

股票管理与日志系统

## 技术栈

- **后端**: Spring Boot 3.2.5 + JPA/H2 + REST API
- **前端**: React 18 + TypeScript + Vite
- **富文本编辑器**: Tiptap (Notion 级别的所见即所得编辑器)

---

## 市场日历 — JSON 批量导入格式

点击日历页头部的 **「⬆ 导入 JSON」** 按钮，选择符合以下格式的 `.json` 文件，即可批量导入事件。

### 格式一：根节点为数组（推荐）

```json
[
  {
    "title": "美联储议息会议",
    "date": "2026-06-18",
    "category": "央行",
    "importance": "HIGH",
    "description": "关注是否降息及点阵图变化"
  },
  {
    "title": "中国5月CPI数据公布",
    "date": "2026-06-10",
    "category": "经济数据",
    "importance": "MEDIUM"
  },
  {
    "title": "苹果WWDC开发者大会",
    "date": "2026-06-09",
    "category": "其他",
    "importance": "LOW",
    "description": "关注AI相关发布"
  }
]
```

### 格式二：根节点为对象，含 `events` 字段

```json
{
  "events": [
    {
      "title": "全国两会",
      "date": "2027-03-05",
      "category": "政策",
      "importance": "HIGH"
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 事件标题 |
| `date` | string | ✅ | 日期，格式必须为 `YYYY-MM-DD` |
| `category` | string | | `政策` / `财报` / `经济数据` / `央行` / `其他`（默认：`其他`）|
| `importance` | string | | `HIGH` / `MEDIUM` / `LOW`（默认：`MEDIUM`）|
| `description` | string | | 事件描述，可多行文字 |

> 格式不符合的条目会被跳过，导入完成后顶部会提示成功数量和跳过数量。

---

## 富文本编辑器实现

### 背景

项目需要一个像 Notion 一样强大的日志编辑器，支持：
- 所见即所得编辑（WYSIWYG）
- 图片粘贴直接内嵌
- 格式化工具栏（加粗、标题、列表等）
- 兼容旧的 Markdown 内容

### 技术选择

选择了 **Tiptap** 作为富文本编辑器核心：
- 基于 ProseMirror（Google Docs、Notion 底层）
- 高度可扩展，支持自定义扩展
- 轻量级，性能优秀
- React 集成良好

### 安装依赖

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-placeholder marked
```

### 核心组件 (DocEditor.tsx)

```tsx
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

export interface DocEditorHandle {
  insertImage: (src: string) => void;
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  readonly?: boolean;
}

export const DocEditor = forwardRef<DocEditorHandle, Props>(
  ({ value, onChange, readonly = false }, ref) => {
    const suppressSyncRef = useRef(false);

    const editor = useEditor({
      extensions: [
        StarterKit,
        Image.configure({ inline: false, allowBase64: true }),
        Placeholder.configure({ placeholder: '开始记录…支持粘贴图片、加粗、标题、列表等' }),
      ],
      content: value || '',
      editable: !readonly,
      onUpdate: ({ editor }) => {
        suppressSyncRef.current = true;
        onChange(editor.getHTML());
        requestAnimationFrame(() => { suppressSyncRef.current = false; });
      },
      editorProps: {
        handlePaste: (_, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (!file) return true;
              const reader = new FileReader();
              reader.onload = (e) => {
                const src = e.target?.result as string;
                editor?.chain().focus().setImage({ src }).run();
                suppressSyncRef.current = true;
                onChange(editor?.getHTML() ?? '');
                requestAnimationFrame(() => { suppressSyncRef.current = false; });
              };
              reader.readAsDataURL(file);
              return true;
            }
          }
          return false;
        },
      },
    });

    useImperativeHandle(ref, () => ({
      insertImage: (src: string) => {
        if (!editor) return;
        editor.chain().focus().setImage({ src }).run();
        suppressSyncRef.current = true;
        onChange(editor.getHTML());
        requestAnimationFrame(() => { suppressSyncRef.current = false; });
      },
    }));

    // Sync external value changes
    useEffect(() => {
      if (!editor || editor.isDestroyed || suppressSyncRef.current) return;
      const current = editor.getHTML();
      const normalized = value || '';
      if (current !== normalized && normalized !== '<p></p>') {
        editor.commands.setContent(normalized, false);
      }
    }, [value, editor]);

    const btn = (label: string, action: () => void, active: boolean, title: string) => (
      <button
        type="button"
        className={`doc-tb-btn${active ? ' active' : ''}`}
        onMouseDown={e => { e.preventDefault(); action(); }}
        title={title}
      >{label}</button>
    );

    return (
      <div className={`doc-tiptap-wrap${readonly ? ' readonly' : ''}`}>
        {!readonly && editor && (
          <div className="doc-tiptap-toolbar">
            {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), '加粗 Ctrl+B')}
            {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), '斜体 Ctrl+I')}
            {btn('S', () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'), '删除线')}
            <span className="doc-tb-sep" />
            {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }), '大标题')}
            {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }), '小标题')}
            {btn('H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }), '三级标题')}
            <span className="doc-tb-sep" />
            {btn('•', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'), '无序列表')}
            {btn('1.', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'), '有序列表')}
            {btn('❝', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'), '引用')}
            {btn('`', () => editor.chain().focus().toggleCode().run(), editor.isActive('code'), '行内代码')}
            {btn('—', () => editor.chain().focus().setHorizontalRule().run(), false, '分割线')}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    );
  }
);
```

### 使用方式

```tsx
// 编辑模式
<DocEditor
  ref={editorRef}
  value={content}
  onChange={setContent}
/>

// 阅读模式
<DocEditor
  value={content}
  onChange={() => {}}
  readonly
/>
```

### 图片处理

#### 即时显示
- 粘贴图片 → FileReader 转 base64 → 直接插入编辑器
- 用户立即看到图片，无需等待上传

#### 保存时上传
```tsx
const processImagesBeforeSave = async (html: string): Promise<string> => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const images = Array.from(doc.querySelectorAll('img[src^="data:image/"]'));
  for (const img of images) {
    const dataUrl = img.getAttribute('src')!;
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'image.png', { type: blob.type });
      const url = await uploadDocImage(file); // 上传到后端
      img.setAttribute('src', url);
    } catch {
      // 上传失败保持 data: URI
    }
  }
  return doc.body.innerHTML;
};
```

#### 后端存储
```java
@Entity
@Table(name = "stock_images")
public class StockImage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String contentType;

    @Lob
    @Column(nullable = false, columnDefinition = "BLOB")
    private byte[] data;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}

@RestController
@RequestMapping("/api/images")
public class ImageController {
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> upload(@RequestParam("file") MultipartFile file) {
        // 保存图片，返回 URL
    }

    @GetMapping("/{id}")
    public ResponseEntity<byte[]> get(@PathVariable Long id) {
        // 按 ID 返回图片
    }
}
```

### 兼容性

- **新内容**: 存储为 HTML
- **旧内容**: Markdown 格式，读取时用 `marked.parse()` 转 HTML
- **编辑旧内容**: 自动转 HTML 后加载到 Tiptap

### 样式配置

```css
/* 工具栏 */
.doc-tiptap-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border);
}

/* 按钮 */
.doc-tb-btn {
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.8rem;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  padding: 3px 7px;
  transition: all 0.1s;
}
.doc-tb-btn:hover { background: var(--hover-bg); color: var(--text-primary); }
.doc-tb-btn.active { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }

/* 编辑区 */
.doc-tiptap-wrap .ProseMirror {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  outline: none;
  font-size: 0.92rem;
  line-height: 1.8;
  color: var(--text-primary);
  min-height: 300px;
}

/* 各种元素样式 */
.doc-tiptap-wrap .ProseMirror h1 { font-size: 1.5rem; font-weight: 700; }
.doc-tiptap-wrap .ProseMirror img { max-width: 100%; border-radius: 6px; margin: 10px 0; }
```

### 优势

1. **用户体验**: 所见即所得，像 Notion 一样
2. **图片处理**: 粘贴即显示，保存时自动上传
3. **性能**: 轻量级，响应迅速
4. **扩展性**: 支持自定义扩展和插件
5. **兼容性**: 向后兼容旧的 Markdown 内容

### 其他项目复用

复制 `DocEditor.tsx` 组件和相关 CSS 到新项目即可。需要后端支持图片上传 API。

---

## 估值快照 — 自动拉取数据

点击估值比较页头部的 **「⟲ 拉取数据」** 按钮，可自动从外部数据源拉取最新数据并保存为快照。

### 支持市场

| 市场 | 数据源 | 需要 API Key |
|------|--------|-------------|
| 🇺🇸 美股 | FMP（主）→ Yahoo Finance（自动备用） | FMP Key 可选 |
| 🇨🇳 A股 | 东方财富（东财接口） | 不需要 |

### 美股拉取逻辑

1. 优先使用 [Financial Modeling Prep (FMP)](https://financialmodelingprep.com/developer/docs)，在主页设置中配置 API Key
2. 若 FMP 返回 403（免费套餐限制）或接口不可用，**自动回退到 Yahoo Finance**（完全免费、无需 Key）

| FMP HTTP 状态 | 处理方式 |
|--------------|---------|
| 200 | 正常拉取 |
| 401 | 报错：API Key 无效 |
| 403 | 静默跳过该接口，关键接口失败时回退 Yahoo Finance |
| 429 | 报错：今日免费额度（250次）已用完 |

#### 各数据源字段覆盖对比

| 字段 | FMP 免费 | Yahoo Finance（备用） |
|------|----------|----------------------|
| PE(TTM) | ✅ | ✅ |
| PS(TTM) | ✅ | ✅ |
| NTM PE | ⚠️ 需付费 | ✅（`forwardPE`） |
| NTM PS | ⚠️ 需付费 | ❌ |
| FCF 倍数 | ✅ | ✅（市值 / 年度FCF计算） |
| Fwd FCF 倍数 | ⚠️ 需付费 | ❌ |
| 毛利率/净利率（季度） | ✅ | ✅ |
| ROIC 年度历史 | ✅ | ❌ |

### A股拉取逻辑

使用东方财富免费接口，无需注册或 API Key。

- 输入 **6位数字代码**，如 `600519`、`000858`、`300750`
- 上交所：6/9 开头；深交所：0/3 开头（自动判断）

| 字段 | 是否支持 |
|------|---------|
| PE(TTM) / PS(TTM) / PCF | ✅ |
| 毛利率/净利率（季度） | ✅ |
| ROIC 年度历史（近4年年报） | ✅ |
| NTM PE/PS（分析师预估） | ❌ 无免费来源 |

### 单条记录刷新

每行右侧的 **↻ 按钮** 可对单条记录重新拉取最新数据：
- ticker 为 6位纯数字 → 走 A股（东方财富）
- 其他 → 走美股（FMP → Yahoo Finance）

---

## 估值快照 — JSON 批量导入格式

点击估值比较页头部的 **「↑ 导入 JSON」** 按钮，粘贴符合以下格式的 JSON，即可批量导入估值快照。

### 格式（数组，支持多条）

```json
[
  {
    "ticker": "AAPL",
    "companyName": "Apple Inc.",
    "snapshotDate": "2026-05-16",
    "pe": 28.5,
    "ps": 7.2,
    "ntmPe": 25.0,
    "ntmPs": 6.8,
    "fcfMultiple": 32.0,
    "fwdFcfMultiple": 28.5,
    "grossMargin": 0.462,
    "grossMarginQ1": 0.465,
    "grossMarginQ2": 0.461,
    "grossMarginQ3": 0.458,
    "grossMarginQ4": 0.464,
    "netMargin": 0.241,
    "nonGaapNetMargin": 0.263,
    "netMarginQ1": 0.251,
    "netMarginQ2": 0.248,
    "netMarginQ3": 0.259,
    "netMarginQ4": 0.206,
    "ttmRoicY1": 0.28,
    "ttmRoicY2": 0.31,
    "ttmRoicY3": 0.35,
    "ttmRoicY4": 0.38,
    "notes": "可选备注，如数据来源、市场环境等"
  },
  {
    "ticker": "MSFT",
    "companyName": "Microsoft Corp.",
    "snapshotDate": "2026-05-16",
    "pe": 35.0,
    "ps": 12.5,
    "fcfMultiple": 40.0,
    "fwdFcfMultiple": 35.0,
    "grossMargin": 0.698,
    "grossMarginQ1": 0.701,
    "grossMarginQ2": 0.695,
    "grossMarginQ3": 0.698,
    "grossMarginQ4": 0.700,
    "netMargin": 0.352,
    "nonGaapNetMargin": 0.381,
    "netMarginQ1": 0.362,
    "netMarginQ2": 0.345,
    "netMarginQ3": 0.350,
    "netMarginQ4": 0.351,
    "ttmRoicY1": 0.22,
    "ttmRoicY2": 0.25,
    "ttmRoicY3": 0.27,
    "ttmRoicY4": 0.30
  }
]
```

> 单条记录也可以直接粘贴对象（不带外层数组）。

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ticker` | string | ✅ | 股票代码，自动转大写 |
| `companyName` | string | ✅ | 公司名称 |
| `snapshotDate` | string | ✅ | 快照日期，格式 `YYYY-MM-DD` |
| `pe` | number | | 市盈率（TTM） |
| `ps` | number | | 市销率（TTM） |
| `ntmPe` | number | | 前瞻市盈率（NTM） |
| `ntmPs` | number | | 前瞻市销率（NTM） |
| `fcfMultiple` | number | | FCF 倍数（FCF Multiple） |
| `fwdFcfMultiple` | number | | 前瞻 FCF 倍数（Forward FCF Multiple，页面简写 Fwd FCF Mul） |
| `grossMargin` | number | | 毛利率，填**小数**形式（如 `0.462` 表示 46.2%），为兼容旧数据保留 |
| `grossMarginQ1` | number | | 最早季度毛利率（小数），Q1–Q4 平均值显示为「毛利率(季均)」，悬停可查看四季明细 |
| `grossMarginQ2` | number | | 季度毛利率（小数） |
| `grossMarginQ3` | number | | 季度毛利率（小数） |
| `grossMarginQ4` | number | | 最新季度毛利率（小数） |
| `netMargin` | number | | 净利率，小数形式 |
| `nonGaapNetMargin` | number | | 扣非净利率（Non-GAAP Net Margin TTM），小数形式，页面简写「NG 净利率」 |
| `netMarginQ1` | number | | 最早季度净利率（小数），Q1–Q4 平均值显示为「净利率(季均)」 |
| `netMarginQ2` | number | | 季度净利率（小数） |
| `netMarginQ3` | number | | 季度净利率（小数） |
| `netMarginQ4` | number | | 最新季度净利率（小数） |
| `ttmRoicY1` | number | | 最早年 TTM ROIC（小数，如 `0.28` 表示 28%） |
| `ttmRoicY2` | number | | 次早年 TTM ROIC（小数） |
| `ttmRoicY3` | number | | 次新年 TTM ROIC（小数） |
| `ttmRoicY4` | number | | **最新年** TTM ROIC（小数），表格中直接显示此值，悬停可查看 Y1–Y4 全部历史 |
| `notes` | string | | 备注 |

---

## 开发

```bash
# 启动开发服务器
.\start-dev.ps1

# 停止服务
.\stop-dev.ps1
```

## 部署

后端: Spring Boot JAR
前端: Vite 构建静态文件