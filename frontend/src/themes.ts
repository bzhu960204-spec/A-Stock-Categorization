export interface ThemeOption {
  id: string;
  label: string;
  group: 'dark' | 'light';
  swatch: string;
}

export const THEMES: ThemeOption[] = [
  { id: 'nord', label: '极地 Nord', group: 'dark', swatch: '#88c0d0' },
  { id: 'midnight', label: '深海 Midnight', group: 'dark', swatch: '#38bdf8' },
  { id: 'light', label: '琥珀 Amber', group: 'light', swatch: '#b07200' },
  { id: 'pure', label: '简白 Pure', group: 'light', swatch: '#2563eb' },
  { id: 'solarized', label: 'Solarized', group: 'light', swatch: '#268bd2' },
];

export const DEFAULT_THEME = 'light';

const VALID_THEMES = new Set(THEMES.map((t) => t.id));

/** Whether a theme id uses a dark base (falls back to light for unknown ids). */
export function isDarkTheme(id: string): boolean {
  return THEMES.find((t) => t.id === id)?.group === 'dark';
}

/** Resolve the initial theme id, migrating the legacy boolean `darkMode` flag. */
export function resolveInitialTheme(): string {
  const saved = localStorage.getItem('theme');
  if (saved && VALID_THEMES.has(saved)) return saved;
  const legacy = localStorage.getItem('darkMode');
  if (legacy === 'true') return 'nord';
  if (legacy === 'false') return 'light';
  return DEFAULT_THEME;
}
