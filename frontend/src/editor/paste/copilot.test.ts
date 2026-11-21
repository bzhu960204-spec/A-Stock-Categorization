// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  normalizePastedHTML,
  repairEscapedCodeLines,
  transformCopilotCodeBlocks,
  transformCopilotMath,
} from './copilot';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html').body;

// Clipboard structure of a Copilot rich answer's pseudo-code block (captured in AI Knowledge Vault)
const PSEUDO_CODE_BLOCK = [
  '<p>Use this formula:</p>',
  '<p><span></span></p>',
  '<div><span>IF(</span><br></div>',
  '<div><span> Party_Role:... = "CN",</span><br></div>',
  '<div><span>  a &lt; b &amp;&amp; c</span><br></div>',
  '<div><span>)</span></div>',
  '<p></p>',
  '<p>Done.</p>',
].join('');

// Broken Copilot "Plain Text" card (captured in AI Knowledge Vault)
const BROKEN_CARD =
  '<p><span></span></p>' +
  '<div><span><code>markdown&lt;/span&gt;&lt;/div&gt;&lt;div&gt;&lt;span attribution="x"&gt;' +
  'Markdown body&lt;/span&gt;&lt;/div&gt;&lt;div&gt;&lt;span attribution="x"&gt;</code></span></div>' +
  '<p></p>';

describe('transformCopilotCodeBlocks', () => {
  it('turns an empty-p / div-lines / empty-p run into one code block', () => {
    const { html, count } = transformCopilotCodeBlocks(PSEUDO_CODE_BLOCK);
    expect(count).toBe(1);
    const body = parse(html);
    const pres = body.querySelectorAll('pre > code');
    expect(pres).toHaveLength(1);
    expect(pres[0].textContent).toBe('IF(\n Party_Role:... = "CN",\n  a < b && c\n)');
    expect(body.querySelectorAll('p')).toHaveLength(2);
    expect(body.firstElementChild?.textContent).toBe('Use this formula:');
    expect(body.lastElementChild?.textContent).toBe('Done.');
  });

  it('converts several blocks independently', () => {
    const block = '<p></p><div><span>x = 1</span></div><p></p>';
    const { html, count } = transformCopilotCodeBlocks(`${block}<p>between</p>${block}`);
    expect(count).toBe(2);
    expect(parse(html).querySelectorAll('pre')).toHaveLength(2);
  });

  it('leaves ordinary content alone', () => {
    const samples = [
      '<p>Hello</p><div><span>x</span></div><p>world</p>', // not fenced by empty paragraphs
      '<p></p><div><b>bold</b></div><p></p>', // div has non-span children
      '<p></p><p></p>', // no lines between the empty paragraphs
      '<p>no divs at all</p>',
    ];
    for (const sample of samples) {
      expect(transformCopilotCodeBlocks(sample)).toEqual({ html: expect.any(String), count: 0 });
      expect(parse(transformCopilotCodeBlocks(sample).html).querySelector('pre')).toBeNull();
    }
  });

  it('repairs a broken Plain Text card but leaves it uncounted', () => {
    const { html, count } = transformCopilotCodeBlocks(BROKEN_CARD);
    expect(count).toBe(0);
    expect(parse(html).querySelector('pre > code')?.textContent).toBe(
      '```markdown\nMarkdown body\n```',
    );
  });
});

describe('repairEscapedCodeLines', () => {
  it('decodes escaped line markup and restores the eaten fences', () => {
    const raw =
      'markdown</span></div><div><span attribution="x">line 1</span></div>' +
      '<div><span>line 2</span></div><div><span>';
    expect(repairEscapedCodeLines(raw)).toBe('```markdown\nline 1\nline 2\n```');
  });

  it('returns null for ordinary inline code', () => {
    expect(repairEscapedCodeLines('a < b')).toBeNull();
    expect(repairEscapedCodeLines('<div>')).toBeNull();
  });
});

// KaTeX markup recorded in docs/paste-handling/formula-conversion-markdown-vs-rich.md
const katex = (latex: string, display: boolean) =>
  `<span class="katex"><math${display ? ' display="block"' : ''}><semantics><mrow><mi>x</mi></mrow>` +
  `<annotation encoding="application/x-tex">${latex}</annotation></semantics></math>` +
  `<span class="katex-html" aria-hidden="true">rendered glyphs</span></span>`;

describe('transformCopilotMath', () => {
  it('converts block and inline KaTeX into math extension nodes', () => {
    const html = `<p>Solve ${katex('ax^2+bx+c=0', false)} now</p>${katex('a \\neq 0', true)}`;
    const result = transformCopilotMath(html);
    expect(result.count).toBe(2);
    const body = parse(result.html);
    const inline = body.querySelector('span[data-type="inline-math"]');
    const block = body.querySelector('div[data-type="block-math"]');
    expect(inline?.getAttribute('data-latex')).toBe('ax^2+bx+c=0');
    expect(block?.getAttribute('data-latex')).toBe('a \\neq 0');
    expect(result.html).not.toContain('rendered glyphs');
  });

  it('skips KaTeX without a TeX annotation and non-KaTeX HTML', () => {
    const noAnnotation = '<span class="katex"><span>x</span></span>';
    expect(transformCopilotMath(noAnnotation).count).toBe(0);
    expect(transformCopilotMath('<p>$x$</p>')).toEqual({ html: '<p>$x$</p>', count: 0 });
  });
});

describe('normalizePastedHTML', () => {
  it('converts KaTeX and leaves other HTML intact', () => {
    const out = normalizePastedHTML(`<p>a ${katex('x', false)}</p><img src="data:image/png;base64,AAAA">`);
    expect(out).toContain('data-type="inline-math"');
    expect(out).toContain('<img src="data:image/png;base64,AAAA">');
  });

  it('drops style, script and comments', () => {
    const out = normalizePastedHTML('<style>p{color:red}</style><!-- x --><p>keep</p><script>alert(1)</script>');
    expect(out).toBe('<p>keep</p>');
  });
});
