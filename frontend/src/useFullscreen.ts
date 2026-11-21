import { useEffect, useSyncExternalStore } from 'react';

/** localStorage key for the sticky, app-wide full-screen preference of document modals. */
const FULLSCREEN_KEY = 'stock-card-doc-fullscreen';

const listeners = new Set<() => void>();

export function loadFullscreen(): boolean {
  try {
    return localStorage.getItem(FULLSCREEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveFullscreen(value: boolean): void {
  try {
    localStorage.setItem(FULLSCREEN_KEY, value ? '1' : '0');
  } catch {
    // Storage unavailable (private mode): the choice just isn't remembered.
  }
  listeners.forEach(l => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * App-wide full-screen preference, shared by the read and edit modals so switching
 * between them keeps the layout. While `active` and full-screen, Escape exits
 * full-screen first (and is swallowed so it doesn't also close the modal).
 */
export function useFullscreen(active = true): [boolean, () => void] {
  const fullscreen = useSyncExternalStore(subscribe, loadFullscreen, () => false);

  useEffect(() => {
    if (!active || !fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      saveFullscreen(false);
    };
    // Capture phase so it runs before the modal's own Escape-to-close listener.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, fullscreen]);

  return [fullscreen, () => saveFullscreen(!loadFullscreen())];
}
