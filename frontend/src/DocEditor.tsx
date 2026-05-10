import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { marked } from 'marked';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableHeader, TableCell } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';

// ── Resizable Image NodeView ──────────────────────────────────────────────────
function ResizableImageView({ node, updateAttributes, editor }: any) {
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef({ startX: 0, startW: 0 });

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current.startX = e.clientX;
    drag.current.startW = imgRef.current?.offsetWidth ?? (node.attrs.width ?? 300);

    const onMove = (mv: MouseEvent) => {
      const newW = Math.max(50, Math.round(drag.current.startW + mv.clientX - drag.current.startX));
      updateAttributes({ width: newW });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [updateAttributes, node.attrs.width]);

  const isEditable: boolean = editor?.isEditable ?? false;
  const w: number | null = node.attrs.width ?? null;

  return (
    <NodeViewWrapper as="div" className="doc-img-wrap" contentEditable={false}>
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt ?? ''}
        title={node.attrs.title ?? undefined}
        style={w ? { width: `${w}px`, maxWidth: '100%' } : { maxWidth: '100%' }}
      />
      {isEditable && (
        <div className="doc-img-resize-handle" onMouseDown={onResizeMouseDown} />
      )}
    </NodeViewWrapper>
  );
}

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => {
          const raw = el.getAttribute('width') || el.style.width;
          if (!raw) return null;
          const n = parseInt(raw, 10);
          return isNaN(n) ? null : n;
        },
        renderHTML: attrs => {
          if (!attrs.width) return {};
          return { width: String(attrs.width), style: `width:${attrs.width}px` };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
// ─────────────────────────────────────────────────────────────────────────────

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
        ResizableImage.configure({ inline: false, allowBase64: true }),
        Placeholder.configure({ placeholder: '开始记录…支持粘贴图片、加粗、标题、列表、表格等' }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
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
          // Parse as markdown if pasted text contains markdown patterns
          const text = event.clipboardData?.getData('text/plain') ?? '';
          const looksLikeMarkdown = /(?:^#{1,6} |^[-*+] |\d+\. |^>|^\|.*\||\*\*|__|```)/m.test(text);
          if (text && looksLikeMarkdown) {
            event.preventDefault();
            const html = marked.parse(text) as string;
            editor?.commands.insertContent(html);
            suppressSyncRef.current = true;
            onChange(editor?.getHTML() ?? '');
            requestAnimationFrame(() => { suppressSyncRef.current = false; });
            return true;
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

    // Sync external value changes (e.g. initial load, image inserted via file picker)
    useEffect(() => {
      if (!editor || editor.isDestroyed || suppressSyncRef.current) return;
      const current = editor.getHTML();
      const normalized = value || '';
      if (current !== normalized && normalized !== '<p></p>') {
        editor.commands.setContent(normalized, false);
      }
    }, [value, editor]);

    const btn = (
      label: string,
      action: () => void,
      active: boolean,
      title: string
    ) => (
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
            <span className="doc-tb-sep" />
            {btn('⊞', () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), false, '插入表格')}
          </div>
        )}
        <div className="doc-editor-scroll">
          <EditorContent editor={editor} className="doc-editor-content" />
        </div>
      </div>
    );
  }
);
