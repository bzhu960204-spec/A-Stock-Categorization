import { useMemo } from 'react';
import { renderMarkdownSafe } from './markdown';

interface MarkdownViewProps {
  markdown: string;
  className?: string;
}

/** Read-only Markdown renderer (GFM + line breaks, sanitised). */
export function MarkdownView({ markdown, className }: MarkdownViewProps) {
  const html = useMemo(() => renderMarkdownSafe(markdown), [markdown]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
