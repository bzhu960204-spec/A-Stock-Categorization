// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { DocEditor } from '../../DocEditor';
import { FeedbackProvider } from '../../shared/ui/feedback/FeedbackProvider';
import { savePasteMode, type PasteMode } from '../pasteMode';

// Paste regression fixtures (ported from AI Knowledge Vault): whole clipboard
// samples run through the real DocEditor — paste handling, Tiptap parsing and
// "…" menu actions — and compared with __fixtures__/<name>/expected.html.
// `npx vitest run src/editor/paste/fixtures -u` writes expected.html for a new
// fixture (review it before committing).

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  uploadDocImage: vi.fn(async () => '/api/images/1'),
}));

// jsdom has no layout: ProseMirror asks ranges for their boxes when scrolling
// the selection into view.
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

interface Meta {
  description: string;
  mode: PasteMode;
  /** Use the clipboard files of another fixture (same sample, other mode or action). */
  clipboardFrom?: string;
  /** "…" menu labels expected right after the paste, by action id ("disabled" = greyed out). */
  menu?: Record<string, string>;
  /** Menu action ids to click after pasting, in order; "reparse" clicks the re-parse hint. */
  actions?: string[];
}

const files = import.meta.glob('./__fixtures__/*/*', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

const byFixture = new Map<string, Record<string, string>>();
for (const [path, content] of Object.entries(files)) {
  const [, name, file] = path.match(/__fixtures__\/([^/]+)\/(.+)$/)!;
  byFixture.set(name, { ...byFixture.get(name), [file]: content });
}

function load(name: string): { meta: Meta; html: string; text: string } {
  const own = byFixture.get(name)!;
  const meta = JSON.parse(own['meta.json']) as Meta;
  const source = meta.clipboardFrom ? byFixture.get(meta.clipboardFrom)! : own;
  return { meta, html: source['clipboard.html'] ?? '', text: source['clipboard.txt'] ?? '' };
}

/** One block per line, so expected.html diffs stay readable. */
function pretty(html: string): string {
  return html.replace(/<(?=(?:p|h[1-6]|pre|ul|ol|li|blockquote|table|tbody|thead|tr|th|td|div|img|hr)[\s>/])/g, '\n<').trim() + '\n';
}

function toggleMenu() {
  fireEvent.click(screen.getByTitle('更多操作'));
}

function menuState(): Record<string, string> {
  const state: Record<string, string> = {};
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
    state[button.dataset.action!] = button.disabled ? 'disabled' : button.textContent ?? '';
  }
  return state;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

const names = [...byFixture.keys()].sort();

describe('paste fixtures', () => {
  it('finds the fixtures', () => {
    expect(names.length).toBeGreaterThanOrEqual(10);
  });

  it.each(names)('%s', async (name) => {
    const { meta, html, text } = load(name);
    savePasteMode(meta.mode);
    const { container } = render(
      <FeedbackProvider>
        <DocEditor value="" onChange={() => {}} />
      </FeedbackProvider>,
    );
    const dom = container.querySelector('.ProseMirror') as HTMLElement & { editor: Editor };
    const data: Record<string, string> = { 'text/html': html, 'text/plain': text };
    fireEvent.paste(dom, {
      clipboardData: {
        getData: (type: string) => data[type] ?? '',
        files: [],
        items: [],
        types: Object.keys(data).filter((t) => data[t]),
      },
    });
    await act(async () => {});

    if (meta.menu) {
      toggleMenu();
      const state = menuState();
      for (const [id, label] of Object.entries(meta.menu)) {
        expect({ id, label: state[id] }).toEqual({ id, label });
      }
      toggleMenu();
    }
    for (const action of meta.actions ?? []) {
      if (action === 'reparse') {
        fireEvent.click(screen.getByText(/^重新解析为/));
      } else {
        toggleMenu();
        fireEvent.click(document.querySelector(`[data-action="${action}"]`)!);
      }
      await act(async () => {});
    }

    await expect(pretty(dom.editor.getHTML())).toMatchFileSnapshot(`./__fixtures__/${name}/expected.html`);
  });
});
