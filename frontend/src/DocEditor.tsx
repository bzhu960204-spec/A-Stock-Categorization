import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { imageFilesFrom, replaceDataImages } from './shared/imageUpload';
import { getErrorMessage, uploadDocImage } from './api';
import { useToast } from './shared/ui/feedback/useFeedback';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableHeader, TableCell } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import { ResizableImage } from './editor/extensions/ResizableImage';
import { FixedInlineMath, FixedBlockMath } from './editor/extensions/math';
import { hasFencedCode, renderMarkdown } from './editor/paste/markdown';
import { tagMarkdownCards } from './editor/paste/markdownCards';
import { normalizePastedHTML, stripPastedNoise, transformCopilotCodeBlocks } from './editor/paste/copilot';
import { collectBrokenCodeOps, collectCardImageOps, collectMathOps } from './editor/paste/docOps';
import { PASTE_MODES, usePasteMode } from './editor/pasteMode';

/** A just-pasted block the user can re-parse the other way (auto mode only). */
interface PasteHint {
  from: number;
  to: number;
  plain: string;
  html: string;
  /** The mode to convert the block TO. */
  toMode: 'rich' | 'markdown';
}

/** A just-pasted Copilot answer whose pseudo-code blocks can be rendered as real code blocks. */
interface CopilotBlocks {
  from: number;
  to: number;
  html: string;
  count: number;
}

// Raw .md source pasted without any rich HTML flavor.
const LOOKS_LIKE_MARKDOWN = /(?:^#{1,6} |^[-*+] |^\d+\. |^>|^\|.*\||\*\*|__|^---\s*$)/m;

// Paste-time follow-up transactions (paste rules etc.) land within this window
// and must not dismiss the offers armed by the paste itself.
const OFFER_GRACE_MS = 400;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Plain text → one paragraph per line (what a native plain-text paste produces). */
function plainTextToHtml(text: string): string {
  return text.split(/\r?\n/).map(line => `<p>${escapeHtml(line)}</p>`).join('');
}

/** True if clipboard HTML carries visible text (not just an <img> wrapper of a copied image). */
function htmlHasText(html: string): boolean {
  return !!html && !!new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim();
}

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
    const toast = useToast();
    const editorRef = useRef<Editor | null>(null);

    const [pasteMode, setPasteMode] = usePasteMode();
    const pasteModeRef = useRef(pasteMode);
    pasteModeRef.current = pasteMode;

    // Re-parse hint (auto mode): `pendingHintRef` carries the block from the
    // paste to its onUpdate, where the inserted range's end is known;
    // `convertingRef` guards our own rewrites from dismissing the offers.
    const [pasteHint, setPasteHint] = useState<PasteHint | null>(null);
    const pasteHintRef = useRef(pasteHint);
    pasteHintRef.current = pasteHint;
    const pendingHintRef = useRef<Omit<PasteHint, 'to'> | null>(null);
    const hintSetAtRef = useRef(0);
    const convertingRef = useRef(false);

    // "…" menu: render a just-pasted Copilot answer's pseudo-code blocks. Valid
    // only until the pasted range is edited — the raw clipboard HTML lives in
    // memory, not in the document.
    const [copilotBlocks, setCopilotBlocks] = useState<CopilotBlocks | null>(null);
    const copilotBlocksRef = useRef(copilotBlocks);
    copilotBlocksRef.current = copilotBlocks;
    const pendingCopilotRef = useRef<Omit<CopilotBlocks, 'to'> | null>(null);
    const copilotSetAtRef = useRef(0);

    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    // Counts shown in the "…" menu; recomputed from the live doc as it opens.
    const [mathCount, setMathCount] = useState(0);
    const [brokenCodeCount, setBrokenCodeCount] = useState(0);
    const [cardImageCount, setCardImageCount] = useState(0);

    const emitChange = (ed: Editor) => {
      suppressSyncRef.current = true;
      onChange(ed.getHTML());
      requestAnimationFrame(() => { suppressSyncRef.current = false; });
    };

    // Inserting a block image leaves it node-selected, so the next paste/typing would replace it.
    // Put the cursor in a paragraph after it instead.
    const moveCursorPastSelectedNode = (ed: Editor) => {
      if ('node' in ed.state.selection) ed.commands.createParagraphNear();
    };

    /** Arm the post-paste offers at the current cursor; the end is resolved in onUpdate. */
    const armOffers = (ed: Editor, hint: Omit<PasteHint, 'from' | 'to'> | null, copilotHtml: string | null) => {
      const from = ed.state.selection.from;
      if (hint) pendingHintRef.current = { ...hint, from };
      if (copilotHtml) {
        const { count } = transformCopilotCodeBlocks(copilotHtml);
        if (count > 0) pendingCopilotRef.current = { from, html: copilotHtml, count };
      }
    };

    const insertPasted = (ed: Editor, content: string) => {
      ed.chain().focus().insertContent(content).run();
      moveCursorPastSelectedNode(ed);
    };

    // Pasted / dropped images go to /api/images; the document only keeps the URL.
    const uploadAndInsert = async (files: File[], pos?: number) => {
      for (const file of files) {
        try {
          const src = await uploadDocImage(file);
          const ed = editorRef.current;
          if (!ed || ed.isDestroyed) return;
          ed.chain().focus(pos ?? null).setImage({ src }).run();
          moveCursorPastSelectedNode(ed);
          pos = undefined;
        } catch (err) {
          toast.error(getErrorMessage(err, '图片上传失败，请重试'));
        }
      }
    };

    /**
     * Paste rich clipboard HTML. Base64 images (Word, web pages, AI "Markdown
     * card" screenshots) are uploaded first so the document only stores
     * /api/images URLs; the uploaded HTML is what the offers keep, so a later
     * re-parse or code-block render doesn't bring the base64 back.
     * Returns false to let Tiptap's native paste handle it.
     */
    const pasteRich = (ed: Editor, html: string, richHtml: string, plain: string, offerMarkdown: boolean): boolean => {
      const hintFor = (h: string) => (offerMarkdown && (plain || h) ? { plain, html: h, toMode: 'markdown' as const } : null);
      if (richHtml.includes('data:image/')) {
        void (async () => {
          const { html: uploaded, failed } = await replaceDataImages(stripPastedNoise(richHtml));
          if (failed > 0) toast.error(`${failed} 张图片上传失败，已保留为内嵌图片`);
          const cur = editorRef.current;
          if (!cur || cur.isDestroyed) return;
          armOffers(cur, hintFor(uploaded), uploaded);
          insertPasted(cur, normalizePastedHTML(uploaded));
        })();
        return true;
      }
      armOffers(ed, hintFor(richHtml), richHtml);
      if (richHtml !== html) {
        insertPasted(ed, normalizePastedHTML(richHtml));
        return true;
      }
      // Native paste; transformPastedHTML applies the same normalization.
      return false;
    };

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
        if (!convertingRef.current) {
          const selTo = editor.state.selection.to;
          const now = Date.now();
          const pending = pendingHintRef.current;
          if (pending) {
            // This update is the paste itself: capture the inserted range's end.
            pendingHintRef.current = null;
            setPasteHint({ ...pending, to: selTo });
            hintSetAtRef.current = now;
          } else if (pasteHintRef.current && now - hintSetAtRef.current > OFFER_GRACE_MS) {
            setPasteHint(null);
          }
          const pendingC = pendingCopilotRef.current;
          if (pendingC) {
            pendingCopilotRef.current = null;
            setCopilotBlocks({ ...pendingC, to: selTo });
            copilotSetAtRef.current = now;
          } else if (copilotBlocksRef.current && now - copilotSetAtRef.current > OFFER_GRACE_MS) {
            setCopilotBlocks(null);
          }
        }
        emitChange(editor);
      },
      onSelectionUpdate: () => {
        forceUpdate(n => n + 1);
      },
      editorProps: {
        transformPastedHTML: normalizePastedHTML,
        handlePaste: (_, event) => {
          const ed = editorRef.current;
          if (!ed) return false;
          const plain = event.clipboardData?.getData('text/plain') ?? '';
          const html = event.clipboardData?.getData('text/html') ?? '';

          // A bare image (screenshot, "copy image"): upload the file. Anything
          // with real HTML content (Word, web pages, AI answers) goes through the
          // HTML paths below, which keep the images it carries.
          const files = imageFilesFrom(event.clipboardData);
          if (files.length > 0 && !htmlHasText(html)) {
            event.preventDefault();
            void uploadAndInsert(files);
            return true;
          }

          const mode = pasteModeRef.current;
          // Rich HTML whose AI "Markdown card" screenshots are tagged with their source.
          const richHtml = tagMarkdownCards(html, plain);

          // Markdown: always render the plain text ourselves so the source's own
          // HTML (loose lists, empty paragraphs) can't leak in.
          if (mode === 'markdown') {
            if (!plain) return false;
            event.preventDefault();
            insertPasted(ed, renderMarkdown(plain));
            return true;
          }
          if (mode === 'rich') {
            if (!html) return false;
            if (pasteRich(ed, html, richHtml, plain, false)) {
              event.preventDefault();
              return true;
            }
            return false;
          }

          // Auto. Fenced code blocks can't survive the clipboard's own HTML
          // (whitespace in ASCII/box-art diagrams collapses), and raw .md source
          // has no HTML at all: render the Markdown ourselves. Either way offer
          // to re-parse the block the other way.
          if (plain && (hasFencedCode(plain) || (!html && LOOKS_LIKE_MARKDOWN.test(plain)))) {
            event.preventDefault();
            armOffers(ed, { plain, html, toMode: 'rich' }, null);
            insertPasted(ed, renderMarkdown(plain));
            return true;
          }
          // Otherwise keep the pasted formatting. `$…$` stays literal; the "…"
          // menu renders formulas on demand.
          if (html) {
            if (pasteRich(ed, html, richHtml, plain, true)) {
              event.preventDefault();
              return true;
            }
            return false;
          }
          if (plain) armOffers(ed, { plain, html, toMode: 'markdown' }, null);
          return false;
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved) return false;
          const files = imageFilesFrom(event.dataTransfer);
          if (files.length === 0) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          void uploadAndInsert(files, pos);
          return true;
        },
      },
    });
    editorRef.current = editor;

    useImperativeHandle(ref, () => ({
      insertImage: (src: string) => {
        if (!editor) return;
        editor.chain().focus().setImage({ src }).run();
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

    // The re-parse hint only applies in auto mode.
    useEffect(() => {
      if (pasteMode !== 'auto') setPasteHint(null);
    }, [pasteMode]);

    useEffect(() => {
      if (!menuOpen) return;
      const onDown = (e: MouseEvent) => {
        if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [menuOpen]);

    /** Replace [from, to) with `content` as one undoable step that keeps the offers alive. */
    const replaceRange = (ed: Editor, from: number, to: number, content: string) => {
      convertingRef.current = true;
      ed.chain().focus().insertContentAt({ from, to }, content).run();
      convertingRef.current = false;
    };

    // Re-parse the just-pasted block the other way, then flip the hint so the
    // user can toggle back. Positions are clamped in case the doc shrank.
    const reparse = useCallback(() => {
      const hint = pasteHintRef.current;
      if (!editor || !hint) return;
      const size = editor.state.doc.content.size;
      const from = Math.min(hint.from, size);
      const to = Math.min(hint.to, size);
      if (to <= from) {
        setPasteHint(null);
        return;
      }
      const content = hint.toMode === 'markdown'
        ? renderMarkdown(hint.plain)
        : hint.html
          ? normalizePastedHTML(tagMarkdownCards(hint.html, hint.plain))
          : plainTextToHtml(hint.plain);
      const before = editor.state.doc.content.size;
      replaceRange(editor, from, to, content);
      const after = editor.state.doc.content.size;
      setPasteHint({
        ...hint,
        from,
        to: to + (after - before),
        toMode: hint.toMode === 'markdown' ? 'rich' : 'markdown',
      });
      hintSetAtRef.current = Date.now();
      // Re-parsing rewrites the pasted range, so a Copilot-block offer is stale.
      setCopilotBlocks(null);
    }, [editor]);

    const renderCopilotBlocks = useCallback(() => {
      const info = copilotBlocksRef.current;
      setMenuOpen(false);
      if (!editor || !info) return;
      const size = editor.state.doc.content.size;
      const from = Math.min(info.from, size);
      const to = Math.min(info.to, size);
      setCopilotBlocks(null);
      if (to <= from) return;
      replaceRange(editor, from, to, normalizePastedHTML(transformCopilotCodeBlocks(info.html).html));
    }, [editor]);

    /**
     * Run a doc-scanning "…" menu action: replacements are applied back-to-front
     * in one transaction (one undo step) so earlier positions stay valid.
     */
    const applyOps = useCallback(<T extends { from: number; to: number }>(
      collect: (ed: Editor) => T[],
      toNode: (ed: Editor, op: T) => PMNode,
      keepCopilotOffer: boolean,
    ) => {
      setMenuOpen(false);
      if (!editor) return;
      const ops = collect(editor).sort((a, b) => b.from - a.from);
      if (!ops.length) return;
      let tr = editor.state.tr;
      for (const op of ops) tr = tr.replaceWith(op.from, op.to, toNode(editor, op));
      convertingRef.current = true;
      editor.view.dispatch(tr);
      convertingRef.current = false;
      const offer = copilotBlocksRef.current;
      if (offer) setCopilotBlocks(keepCopilotOffer ? { ...offer, to: tr.mapping.map(offer.to) } : null);
      editor.commands.focus();
    }, [editor]);

    const convertFormulas = () => applyOps(
      ed => collectMathOps(ed.state.doc),
      (ed, op) => op.kind === 'block'
        ? ed.state.schema.nodes.blockMath.create({ latex: op.latex })
        : ed.state.schema.nodes.inlineMath.create({ latex: op.latex }),
      true,
    );
    const fixBrokenCodeBlocks = () => applyOps(
      ed => collectBrokenCodeOps(ed.state.doc),
      (ed, op) => ed.state.schema.nodes.codeBlock.create(null, ed.state.schema.text(op.text)),
      true,
    );
    const convertCardImages = () => applyOps(
      ed => collectCardImageOps(ed.state.doc),
      (ed, op) => ed.state.schema.nodes.codeBlock.create({ language: 'markdown' }, ed.state.schema.text(op.text)),
      false,
    );

    const toggleMenu = () => {
      if (!editor) return;
      if (!menuOpen) {
        setMathCount(collectMathOps(editor.state.doc).length);
        setBrokenCodeCount(collectBrokenCodeOps(editor.state.doc).length);
        setCardImageCount(collectCardImageOps(editor.state.doc).length);
      }
      setMenuOpen(o => !o);
    };

    const menuActions = [
      {
        id: 'render-copilot-code',
        label: copilotBlocks ? `渲染 ${copilotBlocks.count} 个代码块` : '渲染代码块',
        title: '把刚粘贴的 Copilot 回答里的伪代码块渲染成真正的代码块',
        enabled: !!copilotBlocks,
        run: renderCopilotBlocks,
      },
      {
        id: 'convert-formulas',
        label: mathCount > 0 ? `渲染 ${mathCount} 个公式` : '渲染公式',
        title: '把文中的 $…$ / $$…$$ 渲染成公式（会跳过 $5、$10 这类价格）',
        enabled: mathCount > 0,
        run: convertFormulas,
      },
      {
        id: 'fix-broken-code',
        label: brokenCodeCount > 0 ? `修复 ${brokenCodeCount} 个损坏的代码块` : '修复损坏的代码块',
        title: '修复从 Copilot「Plain Text」卡片粘贴后变成一行乱码的代码块',
        enabled: brokenCodeCount > 0,
        run: fixBrokenCodeBlocks,
      },
      {
        id: 'convert-card-images',
        label: cardImageCount > 0 ? `将 ${cardImageCount} 张图片转为 Markdown` : '图片转为 Markdown',
        title: '把 AI 回答里 Markdown 卡片的截图换成它的 Markdown 源码',
        enabled: cardImageCount > 0,
        run: convertCardImages,
      },
    ];

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
            <div className="doc-tb-right">
              <span className="doc-paste-label">粘贴为</span>
              <div className="doc-paste-modes" role="group" aria-label="粘贴方式">
                {PASTE_MODES.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    className={`doc-paste-mode${pasteMode === m.value ? ' active' : ''}`}
                    aria-pressed={pasteMode === m.value}
                    title={m.title}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setPasteMode(m.value)}
                  >{m.label}</button>
                ))}
              </div>
              <div className="doc-more" ref={menuRef}>
                <button
                  type="button"
                  className={`doc-tb-btn${menuOpen ? ' active' : ''}`}
                  title="更多操作"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onMouseDown={e => e.preventDefault()}
                  onClick={toggleMenu}
                >⋯</button>
                {menuOpen && (
                  <div className="doc-more-menu" role="menu">
                    {menuActions.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        role="menuitem"
                        data-action={a.id}
                        className="doc-more-item"
                        disabled={!a.enabled}
                        title={a.title}
                        onMouseDown={e => e.preventDefault()}
                        onClick={a.run}
                      >{a.label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="doc-editor-scroll">
          <EditorContent editor={editor} className="doc-editor-content" />
        </div>
        {!readonly && pasteMode === 'auto' && pasteHint && (
          <div className="doc-paste-hint" role="status">
            <span className="doc-paste-hint-text">
              {pasteHint.toMode === 'markdown' ? '多出空行？' : '格式丢了？'}
            </span>
            <button type="button" className="doc-paste-hint-btn" onClick={reparse}>
              重新解析为{pasteHint.toMode === 'markdown' ? ' Markdown' : '富文本'}
            </button>
            <button type="button" className="doc-paste-hint-close" title="关闭" onClick={() => setPasteHint(null)}>×</button>
          </div>
        )}
      </div>
    );
  }
);
