// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { autoFenceBoxArt, isHtmlContent, markdownToHtml, renderMarkdownSafe, toEditorHtml } from './markdown';

describe('autoFenceBoxArt', () => {
  it('leaves ordinary paragraphs untouched', () => {
    const md = '# 标题\n\n普通段落\n\n- 列表';
    expect(autoFenceBoxArt(md)).toBe(md);
  });

  it('fences paragraphs that contain box-drawing characters', () => {
    const box = '┌──┐\n│ A │\n└──┘';
    expect(autoFenceBoxArt(`intro\n\n${box}`)).toBe(`intro\n\n\`\`\`\n${box}\n\`\`\``);
  });

  it('fences paragraphs that contain arrows', () => {
    expect(autoFenceBoxArt('上游 → 中游 → 下游')).toBe('```\n上游 → 中游 → 下游\n```');
  });

  it('does not double-fence an existing code block', () => {
    const fenced = '```\n┌──┐\n```';
    expect(autoFenceBoxArt(fenced)).toBe(fenced);
  });

  it('normalises 3+ blank lines between paragraphs to one blank line', () => {
    expect(autoFenceBoxArt('a\n\n\n\nb')).toBe('a\n\nb');
  });
});

describe('markdownToHtml', () => {
  it('supports GFM tables', () => {
    const html = markdownToHtml('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });

  it('keeps single newlines as soft breaks by default', () => {
    expect(markdownToHtml('a\nb')).not.toContain('<br>');
  });

  it('turns single newlines into <br> when breaks is on', () => {
    expect(markdownToHtml('a\nb', { breaks: true })).toContain('<br>');
  });
});

describe('renderMarkdownSafe', () => {
  it('renders line breaks like the read views always did', () => {
    expect(renderMarkdownSafe('第一行\n第二行')).toBe('<p>第一行<br>第二行</p>\n');
  });

  it('strips scripts and inline event handlers', () => {
    const html = renderMarkdownSafe('<img src="x" onerror="alert(1)"><script>alert(2)</script>');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
  });

  it('keeps data: and same-origin image URLs', () => {
    expect(renderMarkdownSafe('![a](/api/images/1)')).toContain('src="/api/images/1"');
    expect(renderMarkdownSafe('![a](data:image/png;base64,AAAA)')).toContain('src="data:image/png;base64,AAAA"');
  });
});

describe('isHtmlContent / toEditorHtml', () => {
  it('detects HTML by a leading tag', () => {
    expect(isHtmlContent('  <p>x</p>')).toBe(true);
    expect(isHtmlContent('# title')).toBe(false);
  });

  it('passes HTML and empty content through unchanged', () => {
    expect(toEditorHtml('<p>x</p>')).toBe('<p>x</p>');
    expect(toEditorHtml('')).toBe('');
  });

  it('converts legacy Markdown to HTML', () => {
    expect(toEditorHtml('**bold**')).toBe('<p><strong>bold</strong></p>\n');
  });
});
