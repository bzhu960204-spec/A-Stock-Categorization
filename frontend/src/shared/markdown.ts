import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Single Markdown pipeline for the whole app (marked + DOMPurify).
 *
 * Stored content is either rich-text HTML (from the Tiptap editor) or legacy
 * Markdown. Read views render Markdown with GFM + "newline = <br>" — the same
 * semantics the previous react-markdown + remark-gfm + remark-breaks setup had.
 */

export interface MarkdownOptions {
  /** Treat single newlines as `<br>` (remark-breaks behaviour). */
  breaks?: boolean;
}

/** Converts Markdown to an HTML string (unsanitised — feed it to Tiptap or sanitise it). */
export function markdownToHtml(md: string, { breaks = false }: MarkdownOptions = {}): string {
  return marked.parse(md, { gfm: true, breaks, async: false });
}

/** Markdown → sanitised HTML that is safe to inject with `dangerouslySetInnerHTML`. */
export function renderMarkdownSafe(md: string): string {
  return sanitizeHtml(markdownToHtml(md, { breaks: true }));
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html);
}

/** Tiptap stores HTML; anything else is treated as legacy Markdown. */
export function isHtmlContent(raw: string): boolean {
  return raw.trimStart().startsWith('<');
}

/** Prepares stored content for the rich-text editor (legacy Markdown → HTML). */
export function toEditorHtml(raw: string): string {
  if (!raw || isHtmlContent(raw)) return raw;
  return markdownToHtml(raw, { breaks: true });
}

/**
 * Split content by double-newline paragraphs; if a paragraph contains
 * box-drawing / arrow characters, wrap it in a fenced code block so that
 * it renders in monospace with preserved whitespace.
 */
export function autoFenceBoxArt(content: string): string {
  // Matches box-drawing (U+2500-U+257F) and common arrows
  const BOX = /[\u2500-\u257F\u2190-\u21FF]/;
  const paragraphs = content.split(/\n{2,}/);
  return paragraphs
    .map(para => {
      if (BOX.test(para) && !para.trim().startsWith('```')) {
        return '```\n' + para + '\n```';
      }
      return para;
    })
    .join('\n\n');
}
