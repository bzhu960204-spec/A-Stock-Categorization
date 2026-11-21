import { describe, expect, it } from 'vitest';
import { hasFencedCode, renderMarkdown } from './markdown';

describe('hasFencedCode', () => {
  it('detects a fenced block anywhere in the text', () => {
    expect(hasFencedCode('intro\n```ts\nconst a = 1;\n```\noutro')).toBe(true);
    expect(hasFencedCode('```\nno language\n```')).toBe(true);
  });

  it('ignores inline code and plain prose', () => {
    expect(hasFencedCode('use `npm test` here')).toBe(false);
    expect(hasFencedCode('just text')).toBe(false);
  });

  it('is stable across repeated calls (global regex lastIndex is reset)', () => {
    const text = '```\nx\n```';
    expect(hasFencedCode(text)).toBe(true);
    expect(hasFencedCode(text)).toBe(true);
  });
});

describe('renderMarkdown', () => {
  it('renders headings, lists and code blocks', () => {
    const html = renderMarkdown('# Title\n\n- one\n- two\n\n```js\nconst x = 1;\n```');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<pre><code class="language-js">const x = 1;\n</code></pre>');
  });

  it('keeps code block whitespace (ASCII diagrams) intact', () => {
    const html = renderMarkdown('```\n+---+\n|   |\n+---+\n```');
    expect(html).toContain('+---+\n|   |\n+---+');
  });

  it('does not let $$ inside a code block swallow the following content', () => {
    const html = renderMarkdown('```bash\necho $$$\n```\n\nAfter $x$ text');
    expect(html).toContain('<pre><code class="language-bash">echo $$$\n</code></pre>');
    expect(html).toContain('<p>After $x$ text</p>');
  });

  it('leaves inline LaTeX literal and unmangled by emphasis', () => {
    const html = renderMarkdown('Both $a_b$ and $c_d$ hold');
    expect(html).toContain('$a_b$ and $c_d$');
    expect(html).not.toContain('<em>');
  });

  it('leaves block LaTeX literal', () => {
    const html = renderMarkdown('$$\n\\frac{a_1}{b_1}\n$$');
    expect(html).toContain('$$\n\\frac{a_1}{b_1}\n$$');
    expect(html).not.toContain('<em>');
  });

  it('does not treat prices as math', () => {
    expect(renderMarkdown('costs $5 to $10 per *month*')).toBe(
      '<p>costs $5 to $10 per <em>month</em></p>\n',
    );
  });
});
