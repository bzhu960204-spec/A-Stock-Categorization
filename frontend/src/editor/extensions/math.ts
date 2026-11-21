import { InputRule } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// In LaTeX/KaTeX several characters have special meaning:
//   '%' = comment (everything after it on the line is ignored)
//   '&' = column separator (in alignment/table environments)
// Users commonly type these literally (e.g. "65.1%", "Cash & Investments").
// We auto-escape them so KaTeX renders the formulas correctly.
export function sanitizeLatex(raw: string): string {
  // 1) Escape unescaped '%' everywhere
  let result = raw.replace(/(?<!\\)%/g, '\\%');
  // 2) Escape unescaped '&' inside \text{...} blocks (where it's always literal)
  result = result.replace(/\\text\s*\{([^}]*)\}/g, (_, content: string) => {
    return `\\text{${content.replace(/(?<!\\)&/g, '\\&')}}`;
  });
  return result;
}

// ── InlineMath with corrected InputRule range ─────────────────────────────────
// Typing `$…$` / `$$…$$` converts to a formula. Pasted text is NOT converted
// (input rules don't run on paste); the "…" menu's "渲染公式" does that on demand.
// The match must end at the cursor (optionally followed by the '\n' Tiptap
// passes when the rule is triggered by Enter): otherwise any keystroke in a line
// holding a literal `$…$` (e.g. pasted text) would convert it and eat the input.
// Tiptap's default range assumes the trigger char is the match's last char; on
// Enter the '\n' is NOT part of the match, so the whole match is already in the
// document and ends at the cursor.
function mathInputRule(find: RegExp, latexGroup: number, create: (latex: string) => PMNode) {
  return new InputRule({
    find,
    handler: ({ state, range, match }) => {
      const latex = sanitizeLatex(match[latexGroup] ?? '');
      if (!latex) return;
      const onEnter = match.input?.endsWith('\n') ?? false;
      const from = onEnter ? range.to - match[0].length : range.from;
      // Multi-char input (IME, insertText) longer than the match: keep it as text.
      if (from > range.to) return;
      state.tr.replaceWith(from, range.to, create(latex));
    },
  });
}

export const FixedInlineMath = InlineMath.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      katexOptions: { throwOnError: false },
    };
  },
  addInputRules() {
    const create = (latex: string) => this.type.create({ latex });
    return [
      mathInputRule(/(?<!\$)\$\$([^$\n]+?)\$\$(?=\n?$)/, 1, create),
      mathInputRule(/(?<!\$)\$([^$\n]+?)\$(?=\n?$)/, 1, create),
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
export const FixedBlockMath = BlockMath.extend({
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
