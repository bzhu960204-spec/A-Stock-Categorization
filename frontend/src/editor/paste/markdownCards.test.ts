// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { tagMarkdownCards } from './markdownCards';

const IMG = '<img src="data:image/png;base64,AAAA">';
const sourceOf = (html: string) => {
  const raw = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('img')
    ?.getAttribute('data-markdown-source');
  return raw == null ? null : decodeURIComponent(raw);
};

describe('tagMarkdownCards', () => {
  it('recovers a Markdown card source from the plain-text flavor', () => {
    const html = `<p>Here is the **template**:</p>${IMG}<p>Use it wisely.</p>`;
    const plain = 'Here is the template:\n\n# Title\n\n- item one\n  - nested\n\nUse it wisely.';
    expect(sourceOf(tagMarkdownCards(html, plain))).toBe('# Title\n\n- item one\n  - nested');
  });

  it('handles a card at the very start or end of the answer', () => {
    expect(sourceOf(tagMarkdownCards(`${IMG}<p>After text</p>`, '## Card\n\nAfter text'))).toBe(
      '## Card',
    );
    expect(sourceOf(tagMarkdownCards(`<p>Before text</p>${IMG}`, 'Before text\n\n## Card'))).toBe(
      '## Card',
    );
  });

  it('tags multiple cards in order', () => {
    const html = `<p>First:</p>${IMG}<p>Second:</p>${IMG}<p>End.</p>`;
    const plain = 'First:\n\nA card\n\nSecond:\n\nB card\n\nEnd.';
    const out = new DOMParser().parseFromString(tagMarkdownCards(html, plain), 'text/html');
    const sources = Array.from(out.querySelectorAll('img')).map((img) =>
      decodeURIComponent(img.getAttribute('data-markdown-source') ?? ''),
    );
    expect(sources).toEqual(['A card', 'B card']);
  });

  it('leaves real screenshots (nothing between the anchors) untouched', () => {
    const html = `<p>See below</p>${IMG}<p>Next part</p>`;
    expect(tagMarkdownCards(html, 'See below\nNext part')).toBe(html);
  });

  it('ignores remote images and missing plain text', () => {
    const remote = '<p>a</p><img src="https://x.test/a.png"><p>b</p>';
    expect(tagMarkdownCards(remote, 'a\ncard\nb')).toBe(remote);
    expect(tagMarkdownCards(`<p>a</p>${IMG}`, '')).toBe(`<p>a</p>${IMG}`);
  });
});
