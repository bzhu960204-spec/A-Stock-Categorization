const RELOAD_KEY = 'chunk-reload-at';
const MIN_INTERVAL_MS = 10_000;

/**
 * After a rebuild, an open tab may still reference module chunks that no longer
 * exist. Vite fires `vite:preloadError` when such a lazy import fails; reload
 * once to pick up the new index.html (rate-limited to avoid reload loops).
 */
export function installChunkReloadHandler(storage: Storage = sessionStorage, reload = () => window.location.reload()) {
  window.addEventListener('vite:preloadError', event => {
    const last = Number(storage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < MIN_INTERVAL_MS) return;
    storage.setItem(RELOAD_KEY, String(Date.now()));
    event.preventDefault();
    reload();
  });
}
