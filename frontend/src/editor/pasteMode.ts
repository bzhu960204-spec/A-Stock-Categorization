import { useSyncExternalStore } from 'react';

/** How pasted content is parsed. `auto` also offers a one-click re-parse. */
export type PasteMode = 'auto' | 'rich' | 'markdown';

export const PASTE_MODES: { value: PasteMode; label: string; title: string }[] = [
  { value: 'auto', label: '自动', title: '自动：含代码块按 Markdown 解析，否则保留粘贴的格式；粘贴后可一键换另一种方式重新解析' },
  { value: 'rich', label: '富文本', title: '富文本：原样保留粘贴的格式（HTML）' },
  { value: 'markdown', label: 'Markdown', title: 'Markdown：把纯文本按 Markdown 解析成干净的格式' },
];

/** localStorage key for the sticky, app-wide paste mode. */
const PASTE_MODE_KEY = 'stock-card-paste-mode';

const listeners = new Set<() => void>();

export function loadPasteMode(): PasteMode {
  try {
    const stored = localStorage.getItem(PASTE_MODE_KEY);
    return stored === 'rich' || stored === 'markdown' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function savePasteMode(mode: PasteMode): void {
  try {
    localStorage.setItem(PASTE_MODE_KEY, mode);
  } catch {
    // Storage unavailable (private mode): the choice just isn't remembered.
  }
  listeners.forEach(l => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The app-wide paste mode; every open editor follows a change made in any of them. */
export function usePasteMode(): [PasteMode, (mode: PasteMode) => void] {
  const mode = useSyncExternalStore(subscribe, loadPasteMode, () => 'auto' as PasteMode);
  return [mode, savePasteMode];
}
