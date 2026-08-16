/**
 * Split content by double-newline paragraphs; if a paragraph contains
 * box-drawing / arrow characters, wrap it in a fenced code block so that
 * ReactMarkdown renders it in monospace with preserved whitespace.
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
