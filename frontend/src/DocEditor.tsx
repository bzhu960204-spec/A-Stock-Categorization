import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { marked } from 'marked';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { InputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableHeader, TableCell } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics';
import katex from 'katex';
import 'katex/dist/katex.min.css';

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

// ── Helpers ───────────────────────────────────────────────────────────────────
// In LaTeX/KaTeX several characters have special meaning:
//   '%' = comment (everything after it on the line is ignored)
//   '&' = column separator (in alignment/table environments)
// Users commonly type these literally (e.g. "65.1%", "Cash & Investments").
// We auto-escape them so KaTeX renders the formulas correctly.
function sanitizeLatex(raw: string): string {
  // 1) Escape unescaped '%' everywhere
  let result = raw.replace(/(?<!\\)%/g, '\\%');
  // 2) Escape unescaped '&' inside \text{...} blocks (where it's always literal)
  result = result.replace(/\\text\s*\{([^}]*)\}/g, (_, content: string) => {
    return `\\text{${content.replace(/(?<!\\)&/g, '\\&')}}`;
  });
  return result;
}

// ── InlineMath with corrected InputRule range ─────────────────────────────────
// Tiptap triggers InputRules on Enter with text='\n'. The default range formula
// `from - (match[0].length - text.length)` is off-by-1 in that case because
// '\n' is NOT part of the match. Fix: resolve the block start position and add
// match.index so the range is correct regardless of trigger character.
const FixedInlineMath = InlineMath.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      katexOptions: { throwOnError: false },
    };
  },
  addInputRules() {
    return [
      // $$...$$ trigger (original)
      new InputRule({
        find: /(?<!\$)(\$\$([^$\n]+?)\$\$)(?!\$)/,
        handler: ({ state, range, match }) => {
          const latex = sanitizeLatex(match[2] ?? '');
          if (!latex) return;
          const { tr } = state;
          const blockStart = state.doc.resolve(range.to).start();
          const correctFrom = blockStart + (match.index ?? 0);
          tr.replaceWith(correctFrom, range.to, this.type.create({ latex }));
        },
      }),
      // $...$ trigger (single dollar)
      new InputRule({
        find: /(?<!\$)\$([^$\n]+?)\$(?!\$)/,
        handler: ({ state, range, match }) => {
          const latex = sanitizeLatex(match[1] ?? '');
          if (!latex) return;
          const { tr } = state;
          const blockStart = state.doc.resolve(range.to).start();
          const correctFrom = blockStart + (match.index ?? 0);
          tr.replaceWith(correctFrom, range.to, this.type.create({ latex }));
        },
      }),
    ];
  },
  addNodeView() {
    const katexOptions = this.options.katexOptions;
    return ({ node }) => {
      const wrapper = document.createElement('span');
      wrapper.className = 'tiptap-mathematics-render';
      if (this.editor.isEditable) {
        wrapper.classList.add('tiptap-mathematics-render--editable');
      }
      wrapper.dataset.type = 'inline-math';
      wrapper.setAttribute('data-latex', node.attrs.latex);
      try {
        katex.render(sanitizeLatex(node.attrs.latex), wrapper, katexOptions);
      } catch {
        wrapper.textContent = node.attrs.latex;
        wrapper.classList.add('inline-math-error');
      }
      return { dom: wrapper };
    };
  },
});

// ── BlockMath with % sanitization ─────────────────────────────────────────────
const FixedBlockMath = BlockMath.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      katexOptions: { throwOnError: false },
    };
  },
  addNodeView() {
    const katexOptions = this.options.katexOptions;
    return ({ node }) => {
      const wrapper = document.createElement('div');
      const innerWrapper = document.createElement('div');
      wrapper.className = 'tiptap-mathematics-render';
      if (this.editor.isEditable) {
        wrapper.classList.add('tiptap-mathematics-render--editable');
      }
      innerWrapper.className = 'block-math-inner';
      wrapper.dataset.type = 'block-math';
      wrapper.setAttribute('data-latex', node.attrs.latex);
      wrapper.appendChild(innerWrapper);
      try {
        katex.render(sanitizeLatex(node.attrs.latex), innerWrapper, katexOptions);
      } catch {
        wrapper.textContent = node.attrs.latex;
        wrapper.classList.add('block-math-error');
      }
      return { dom: wrapper };
    };
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
    const [, forceUpdate] = useState(0);

    const editor = useEditor({
      extensions: [
        StarterKit,
        ResizableImage.configure({ inline: false, allowBase64: true }),
        Placeholder.configure({ placeholder: '开始记录…支持粘贴图片、加粗、标题、列表、表格等' }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        FixedInlineMath,
        FixedBlockMath,
      ],
      content: value || '',
      // Always start editable so NodeViews (KaTeX) initialize properly.
      // We switch to non-editable below via setEditable() after mounting.
      editable: true,
      onUpdate: ({ editor }) => {
        suppressSyncRef.current = true;
        onChange(editor.getHTML());
        requestAnimationFrame(() => { suppressSyncRef.current = false; });
      },
      onSelectionUpdate: () => {
        forceUpdate(n => n + 1);
      },
      editorProps: {
        // Sanitize rich pastes: drop <style>/<script>/comments so their text
        // (e.g. leaked CSS) never lands in the document. Keep everything else
        // (headings, bold, tables, images…) so the clipboard's formatting survives.
        transformPastedHTML: (html) =>
          html
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, ''),
        handlePaste: (_, event) => {
          const items = event.clipboardData?.items;
          if (items) {
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
          }

          const plain = event.clipboardData?.getData('text/plain') ?? '';
          const html = event.clipboardData?.getData('text/html') ?? '';

          const renderMarkdown = () => {
            event.preventDefault();
            editor?.commands.insertContent(marked.parse(plain) as string);
            suppressSyncRef.current = true;
            onChange(editor?.getHTML() ?? '');
            requestAnimationFrame(() => { suppressSyncRef.current = false; });
            return true;
          };

          // Fenced code blocks can't survive the clipboard's own HTML (whitespace
          // in ASCII/box-art diagrams collapses), so render the Markdown ourselves.
          const hasFencedCode = /```[\s\S]*?```/.test(plain);
          if (plain && hasFencedCode) return renderMarkdown();

          // Only convert Markdown ourselves when there's NO rich HTML on the
          // clipboard (e.g. pasting raw .md source). When rich HTML exists, trust
          // it — that preserves headings/bold/tables/lists/links verbatim.
          const looksLikeMarkdown = /(?:^#{1,6} |^[-*+] |^\d+\. |^>|^\|.*\||\*\*|__|^---\s*$)/m.test(plain);
          if (!html && plain && looksLikeMarkdown) return renderMarkdown();

          // Otherwise keep Tiptap's native paste (preserves rich clipboard HTML).
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

    // Switch editable state after editor mounts so NodeViews always initialise.
    useEffect(() => {
      if (!editor || editor.isDestroyed) return;
      editor.setEditable(!readonly, false);
    }, [editor, readonly]);

    // Sync external value changes (e.g. initial load, image inserted via file picker)
    useEffect(() => {
      if (!editor || editor.isDestroyed || suppressSyncRef.current) return;
      const current = editor.getHTML();
      const normalized = value || '';
      if (current !== normalized && normalized !== '<p></p>') {
        editor.commands.setContent(normalized, { emitUpdate: false });
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
            {btn('∑', () => editor.chain().focus().insertInlineMath({ latex: '' }).run(), false, '插入行内数学公式 (输入后双击可编辑；或直接在文中输入 $$公式$$ 回车触发)')}
            {btn('⊞', () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), false, '插入表格')}
            {editor.isActive('table') && (<>
              <span className="doc-tb-sep" />
              {btn('行+', () => editor.chain().focus().addRowAfter().run(), false, '在下方插入行')}
              {btn('行−', () => editor.chain().focus().deleteRow().run(), false, '删除当前行')}
              {btn('列+', () => editor.chain().focus().addColumnAfter().run(), false, '在右侧插入列')}
              {btn('列−', () => editor.chain().focus().deleteColumn().run(), false, '删除当前列')}
              {btn('🗑表格', () => editor.chain().focus().deleteTable().run(), false, '删除整个表格')}
            </>)}
          </div>
        )}
        <div className="doc-editor-scroll">
          <EditorContent editor={editor} className="doc-editor-content" />
        </div>
      </div>
    );
  }
);
