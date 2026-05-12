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