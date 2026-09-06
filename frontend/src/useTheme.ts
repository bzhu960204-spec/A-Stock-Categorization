import { useEffect, useState } from 'react';
import { isDarkTheme, resolveInitialTheme, THEMES } from './themes';

const THEME_EVENT = 'app-themechange';

function applyTheme(id: string) {
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem('theme', id);
  // Keep the legacy flag in sync so any remaining boolean consumers still work.
  localStorage.setItem('darkMode', String(isDarkTheme(id)));
}

/** Current theme id with a setter, synced across all mounted instances. */
export function useTheme(): [string, (id: string) => void] {
  const [theme, setThemeState] = useState(resolveInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const handler = (e: Event) => setThemeState((e as CustomEvent<string>).detail);
    window.addEventListener(THEME_EVENT, handler);
    return () => window.removeEventListener(THEME_EVENT, handler);
  }, []);

  const setTheme = (id: string) => {
    if (!THEMES.some((t) => t.id === id)) return;
    setThemeState(id);
    applyTheme(id);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: id }));
  };

  return [theme, setTheme];
}
