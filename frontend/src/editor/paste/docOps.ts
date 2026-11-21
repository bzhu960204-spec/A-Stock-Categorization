import type { Node as PMNode } from '@tiptap/pm/model';
import { repairEscapedCodeLines } from './copilot';

// ── On-demand math conversion (current answer) ───────────────────────────────
// Math stays literal on paste/load; this turns the note's stored `$…$` / `$$…$$`
// text into interactive KaTeX nodes when the user opts in via the "…" menu.
// Unlike the Copilot code-block feature (whose signature only lives in the raw
// clipboard HTML), the delimiters are persisted in the doc, so this works at any
// time by scanning the document itself.
export interface MathOp {
  /** Absolute doc range to replace. */
  from: number;
  to: number;
  /** `$$…$$` whole-paragraph → block node; `$…$` span → inline node. */
  kind: 'block' | 'inline';
  latex: string;
}

// Whole-paragraph block math: the trimmed paragraph text is exactly `$$…$$`.
const BLOCK_MATH_RE = /^\$\$([\s\S]+)\$\$$/;
// Inline `$…$`, mirroring renderMarkdown's currency-safe shielding so prices
// (`$5`, `$5 to $10`) and citation titles aren't mistaken for formulas.
const INLINE_MATH_RE = /\$(?!\d+\$)[^\n]+?\$(?!\d)/g;

/**
 * Scan the document for literal LaTeX delimiters and return the replacements.
 *
 * Conservative by design: code blocks and inline `code` are skipped, block math
 * is only recognised when a paragraph is *entirely* `$$…$$` (and free of inline
 * atoms like existing math), and `$$…$$` runs are masked before the single-`$`
 * scan so they aren't mis-sliced.
 */
export function collectMathOps(doc: PMNode): MathOp[] {
  const ops: MathOp[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'codeBlock') return false; // never touch code
    if (node.type.name === 'paragraph') {
      const text = node.textContent;
      const block = BLOCK_MATH_RE.exec(text.trim());
      // content.size === text.length ⇒ plain text only (no inline math/breaks).
      if (block && node.content.size === text.length) {
        const latex = block[1].trim();
        if (latex) {
          ops.push({ kind: 'block', from: pos, to: pos + node.nodeSize, latex });
          return false; // handled as one block; skip inline scan inside
        }
      }
      return true;
    }
    if (node.isText) {
      if (node.marks.some((m) => m.type.name === 'code')) return true; // skip inline code
      const s = node.text ?? '';
      const masked = s.replace(/\$\$[\s\S]+?\$\$/g, (m) => '\u0000'.repeat(m.length));
      let m: RegExpExecArray | null;
      INLINE_MATH_RE.lastIndex = 0;
      while ((m = INLINE_MATH_RE.exec(masked)) !== null) {
        const latex = s.slice(m.index + 1, m.index + m[0].length - 1).trim();
        if (latex) ops.push({ kind: 'inline', from: pos + m.index, to: pos + m.index + m[0].length, latex });
      }
      return true;
    }
    return true;
  });
  return ops;
}

// ── Broken Copilot "Plain Text" code blocks (on demand) ──────────────────────
// The broken text is stored in the doc, so it can be repaired at any time:
// decode the lines, put the eaten ``` pair back around them, and make it a
// real code block (see repairEscapedCodeLines).
export interface BrokenCodeOp {
  from: number;
  to: number;
  text: string;
}

export function collectBrokenCodeOps(doc: PMNode): BrokenCodeOp[] {
  const ops: BrokenCodeOp[] = [];
  let lastTo = -1;
  doc.descendants((node, pos) => {
    if (node.type.name === 'codeBlock') return false;
    if (node.type.name !== 'paragraph') return true;
    const child = node.childCount === 1 ? node.firstChild : null;
    if (!child?.isText || !child.marks.some((m) => m.type.name === 'code')) return false;
    const text = repairEscapedCodeLines(child.text ?? '');
    if (text === null) return false;

    // Also swallow the empty paragraphs Copilot leaves around the block.
    const $pos = doc.resolve(pos);
    const parent = $pos.parent;
    const idx = $pos.index();
    const isEmptyP = (n: PMNode | null | undefined) =>
      !!n && n.type.name === 'paragraph' && n.content.size === 0;
    let from = pos;
    let to = pos + node.nodeSize;
    const prev = idx > 0 ? parent.child(idx - 1) : null;
    if (isEmptyP(prev) && from - prev!.nodeSize >= lastTo) from -= prev!.nodeSize;
    const next = idx + 1 < parent.childCount ? parent.child(idx + 1) : null;
    if (isEmptyP(next)) to += next!.nodeSize;

    ops.push({ from, to, text });
    lastTo = to;
    return false;
  });
  return ops;
}

// Images tagged at paste time with their Markdown source (see tagMarkdownCards).
export function collectCardImageOps(doc: PMNode): BrokenCodeOp[] {
  const ops: BrokenCodeOp[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs.markdownSource) {
      ops.push({ from: pos, to: pos + node.nodeSize, text: node.attrs.markdownSource as string });
    }
    return true;
  });
  return ops;
}
