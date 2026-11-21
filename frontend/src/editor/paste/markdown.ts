import { marked } from 'marked';

// ── Fenced code detection (for paste) ────────────────────────────────────────
// Fenced code block ```lang\n…\n``` — anywhere in the text, not just as the
// whole clipboard. `[^\n]*` captures an optional language label.
const FENCE_RE = /```([^\n]*)\n([\s\S]*?)\n?```/g;

/** True if the pasted text contains a fenced code block. */
export function hasFencedCode(text: string): boolean {
  FENCE_RE.lastIndex = 0;
  return FENCE_RE.test(text);
}

/**
 * Render pasted Markdown to HTML.
 *
 * LLM answers are Markdown, and the clipboard's own HTML often flattens fenced
 * code diagrams (collapsing the whitespace ASCII / box-drawing art relies on)
 * or drops structure. Rendering the Markdown ourselves keeps headings, lists,
 * links, bold, code blocks (whitespace intact) all correct.
 *
 * LaTeX is shielded with placeholders first so Markdown doesn't mangle it (e.g.
 * `a_b` → emphasis); the literal `$…$` / `$$…$$` is restored afterwards and
 * left as plain text (the user renders it to math manually via the toolbar).
 */
export function renderMarkdown(md: string): string {
  // Protect fenced code blocks before math-shielding. Otherwise a literal
  // `$$$` (or any `$$`) inside a code block would be swallowed by the `$$…$$`
  // math regex below, which then greedily consumes the block's closing fence
  // and everything up to the next dollar sign — leaking the code block into the
  // following content.
  const fences: string[] = [];
  const withoutFences = md.replace(FENCE_RE, (m) => `\u0000F${fences.push(m) - 1}\u0000`);

  const math: string[] = [];
  const stash = (m: string) => `\u0000M${math.push(m) - 1}\u0000`;
  const shielded = withoutFences
    .replace(/\$\$[\s\S]+?\$\$/g, stash)
    .replace(/\$(?!\d+\$)[^\n]+?\$(?!\d)/g, stash);

  // Restore the code fences so `marked` renders them as real code blocks.
  // \u0000 placeholders are intentional: NUL never occurs in pasted text.
  // eslint-disable-next-line no-control-regex
  const restored = shielded.replace(/\u0000F(\d+)\u0000/g, (_, i) => fences[Number(i)]);
  const html = marked.parse(restored, { gfm: true, breaks: false, async: false }) as string;
  // eslint-disable-next-line no-control-regex
  return html.replace(/\u0000M(\d+)\u0000/g, (_, i) => math[Number(i)]);
}
