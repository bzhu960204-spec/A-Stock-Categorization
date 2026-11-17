import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, isDarkTheme, resolveInitialTheme } from './themes';

function stubStorage(values: Record<string, string>) {
  vi.stubGlobal('localStorage', { getItem: (k: string) => values[k] ?? null });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isDarkTheme', () => {
  it('identifies dark themes and falls back to light for unknown ids', () => {
    expect(isDarkTheme('nord')).toBe(true);
    expect(isDarkTheme('light')).toBe(false);
    expect(isDarkTheme('does-not-exist')).toBe(false);
  });
});

describe('resolveInitialTheme', () => {
  it('uses a valid saved theme', () => {
    stubStorage({ theme: 'midnight' });
    expect(resolveInitialTheme()).toBe('midnight');
  });

  it('ignores an unknown saved theme and migrates the legacy darkMode flag', () => {
    stubStorage({ theme: 'bogus', darkMode: 'true' });
    expect(resolveInitialTheme()).toBe('nord');
    stubStorage({ darkMode: 'false' });
    expect(resolveInitialTheme()).toBe('light');
  });

  it('falls back to the default theme', () => {
    stubStorage({});
    expect(resolveInitialTheme()).toBe(DEFAULT_THEME);
  });
});
