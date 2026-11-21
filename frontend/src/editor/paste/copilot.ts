// ── Copilot rich-answer pseudo-code blocks ───────────────────────────────────
// Copilot's rich (HTML) answers render code as a run of one-line divs bounded by
// empty paragraphs — not a real <pre>, so it pastes as loose prose:
//   <p><span></span></p>            ← opener (empty paragraph)
//   <div><span>line 1</span><br></div>
//   <div><span>line 2</span></div>  ← last line's <br> is often omitted
//   <p></p>                          ← closer (empty paragraph)
// This rewrites each such run into a real <pre><code> (whitespace + entities
// preserved). The signature is specific enough that ordinary content — even
// with blank lines — won't match (a code run needs ≥1 bare <div><span> line
// fenced by two empty paragraphs).
export function transformCopilotCodeBlocks(html: string): { html: string; count: number } {
  if (!html || !/<div/i.test(html)) return { html, count: 0 };
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const isEmptyP = (el: Element | null): boolean =>
    !!el && el.tagName === 'P' && (el.textContent ?? '').trim() === '';
  // A code line is a <div> whose only element children are <span>/<br>.
  const isCodeDiv = (el: Element | null): boolean => {
    if (!el || el.tagName !== 'DIV') return false;
    const els = Array.from(el.children);
    return els.length > 0 && els.every((e) => e.tagName === 'SPAN' || e.tagName === 'BR');
  };

  type Match = { opener: Element; closer: Element; divs: Element[] };
  const matches: Match[] = [];
  const consumed = new Set<Element>();

  for (const opener of Array.from(doc.querySelectorAll('p')).filter(isEmptyP)) {
    if (consumed.has(opener)) continue;
    const divs: Element[] = [];
    let sib = opener.nextElementSibling;
    while (isCodeDiv(sib)) {
      divs.push(sib as Element);
      sib = (sib as Element).nextElementSibling;
    }
    if (divs.length === 0 || !isEmptyP(sib)) continue;
    matches.push({ opener, closer: sib as Element, divs });
    consumed.add(opener);
    consumed.add(sib as Element);
  }

  // A single-line run whose <code> holds escaped line markup is a broken card
  // (see below): repair it here, but don't count it — "Fix broken code blocks"
  // owns it, so the two menu actions never both claim the same block.
  const broken = new Map<Element, string>();
  for (const { opener, divs } of matches) {
    const inner = divs.length === 1 ? divs[0].querySelector('code') : null;
    const repaired = inner ? repairEscapedCodeLines(inner.textContent ?? '') : null;
    if (repaired !== null) broken.set(opener, repaired);
  }

  for (const { opener, closer, divs } of matches) {
    const pre = doc.createElement('pre');
    const code = doc.createElement('code');
    // textContent decodes &lt;/&gt; and keeps leading spaces (the indentation).
    code.textContent = (broken.get(opener) ?? divs
      .map((d) => (d.querySelector('span') ?? d).textContent ?? '')
      .join('\n'));
    pre.appendChild(code);
    opener.parentNode?.insertBefore(pre, opener);
    divs.forEach((d) => d.remove());
    opener.remove();
    closer.remove();
  }

  return { html: doc.body.innerHTML, count: matches.length - broken.size };
}

// ── Copilot rich-answer math (KaTeX) ─────────────────────────────────────────
// Copilot renders math with KaTeX, so its rich (HTML) answers carry NO `$…$`
// delimiters — each formula is a `<span class="katex">` whose LaTeX source lives
// only in `<annotation encoding="application/x-tex">`, next to presentation
// MathML. TipTap doesn't understand that markup, so a plain rich paste flattens
// it into the rendered glyphs *and* the raw LaTeX concatenated (garbage). This
// rewrites each `.katex` into the math extension's own parseable element
// (`div[data-type=block-math]` / `span[data-type=inline-math]` with `data-latex`)
// BEFORE TipTap parses the paste, so the formulas land as real math nodes.
// display="block" ⇒ block formula, otherwise inline. Unambiguous (an x-tex
// annotation is always math), so it's safe to run on every paste.
export function transformCopilotMath(html: string): { html: string; count: number } {
  if (!html || !/class=["']katex["']/i.test(html)) return { html, count: 0 };
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let count = 0;
  for (const span of Array.from(doc.querySelectorAll('span.katex'))) {
    const latex = span
      .querySelector('annotation[encoding="application/x-tex"]')
      ?.textContent?.trim();
    if (!latex) continue;
    const isBlock = span.querySelector('math')?.getAttribute('display') === 'block';
    const el = doc.createElement(isBlock ? 'div' : 'span');
    el.setAttribute('data-type', isBlock ? 'block-math' : 'inline-math');
    el.setAttribute('data-latex', latex);
    span.replaceWith(el);
    count += 1;
  }
  return { html: doc.body.innerHTML, count };
}

/**
 * Drop <style>/<script>/comments so their text (e.g. leaked CSS) never lands in
 * the document. Everything else (headings, bold, tables, images…) is kept.
 */
export function stripPastedNoise(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/** Clean-ups applied to any HTML entering the editor via a paste. */
export function normalizePastedHTML(html: string): string {
  return transformCopilotMath(stripPastedNoise(html)).html;
}

// ── Broken Copilot "Plain Text" code blocks ──────────────────────────────────
// Copilot's rich HTML turns a card whose lines are ```lang / body / ``` into ONE
// inline `code` run: the fences are eaten as code-span delimiters and the lines
// inside are their own escaped `<div><span>…</span></div>` markup.
const ESCAPED_LINES_RE = /<\/(?:span|div)>\s*<div\b/;

/** Decode escaped line markup and put the eaten ``` pair back; null if not such text. */
export function repairEscapedCodeLines(raw: string): string | null {
  if (!ESCAPED_LINES_RE.test(raw)) return null;
  const parsed = new DOMParser().parseFromString(`<div><span>${raw}</span></div>`, 'text/html');
  const lines = Array.from(parsed.body.children).map((d) => d.textContent ?? '');
  return lines.length < 2 ? null : '```' + lines.join('\n') + '```';
}
