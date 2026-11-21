// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { collectBrokenCodeOps, collectCardImageOps, collectMathOps } from './docOps';

// Mirrors the editor's image node: the Markdown card source lives in an attribute.
const CardImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownSource: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-markdown-source');
          return raw ? decodeURIComponent(raw) : null;
        },
      },
    };
  },
});

const schema = getSchema([StarterKit, CardImage.configure({ allowBase64: true })]);
const toDoc = (html: string) =>
  PMDOMParser.fromSchema(schema).parse(new DOMParser().parseFromString(html, 'text/html').body);

describe('collectMathOps', () => {
  it('finds inline and whole-paragraph block math', () => {
    const doc = toDoc('<p>Euler: $e^{i\\pi}+1=0$ done</p><p>$$ x^2 $$</p>');
    const ops = collectMathOps(doc);
    expect(ops.map(({ kind, latex }) => ({ kind, latex }))).toEqual([
      { kind: 'inline', latex: 'e^{i\\pi}+1=0' },
      { kind: 'block', latex: 'x^2' },
    ]);
    const inline = ops[0];
    expect(doc.textBetween(inline.from, inline.to)).toBe('$e^{i\\pi}+1=0$');
    const block = ops[1];
    expect(doc.nodeAt(block.from)?.type.name).toBe('paragraph');
    expect(block.to - block.from).toBe(doc.nodeAt(block.from)?.nodeSize);
  });

  it('skips prices, code blocks and inline code', () => {
    const doc = toDoc(
      '<p>Price $5 to $10</p><pre><code>echo $a$</code></pre><p>use <code>$b$</code> here</p>',
    );
    expect(collectMathOps(doc)).toEqual([]);
  });

  it('does not slice $$…$$ inside a sentence into inline math', () => {
    const doc = toDoc('<p>see $$ y $$ and $z$</p>');
    expect(collectMathOps(doc).map((o) => o.latex)).toEqual(['z']);
  });
});

describe('collectBrokenCodeOps', () => {
  const broken =
    '<code>markdown&lt;/span&gt;&lt;/div&gt;&lt;div&gt;&lt;span&gt;body line&lt;/span&gt;' +
    '&lt;/div&gt;&lt;div&gt;&lt;span&gt;</code>';

  it('repairs a broken card and swallows its surrounding empty paragraphs', () => {
    const doc = toDoc(`<p>intro</p><p></p><p>${broken}</p><p></p><p>outro</p>`);
    const ops = collectBrokenCodeOps(doc);
    expect(ops).toHaveLength(1);
    expect(ops[0].text).toBe('```markdown\nbody line\n```');
    const intro = doc.child(0).nodeSize;
    expect(ops[0].from).toBe(intro);
    expect(ops[0].to).toBe(doc.content.size - doc.child(4).nodeSize);
  });

  it('ignores ordinary inline code and code blocks', () => {
    const doc = toDoc('<p><code>a &lt; b</code></p><pre><code>x</code></pre>');
    expect(collectBrokenCodeOps(doc)).toEqual([]);
  });
});

describe('collectCardImageOps', () => {
  it('returns tagged images only', () => {
    const tagged = `<img src="data:image/png;base64,AAAA" data-markdown-source="${encodeURIComponent('# Card')}">`;
    const doc = toDoc(`${tagged}<img src="data:image/png;base64,BBBB">`);
    const ops = collectCardImageOps(doc);
    expect(ops).toHaveLength(1);
    expect(ops[0].text).toBe('# Card');
    expect(doc.nodeAt(ops[0].from)?.type.name).toBe('image');
  });
});
