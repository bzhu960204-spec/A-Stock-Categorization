import { useMemo } from 'react';
import { useTheme } from '../../../useTheme';

export interface ChartPalette {
  themeId: string;
  text: string;
  textMuted: string;
  grid: string;
  border: string;
  background: string;
  tooltipBackground: string;
  danger: string;
  warning: string;
  success: string;
  /** Distinct line colours, taken from the theme first. */
  series: string[];
}

const FALLBACK_SERIES = ['#a855f7', '#f97316', '#14b8a6', '#ec4899', '#64748b'];

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}

/** Reads the active theme's CSS variables so the canvas follows the theme (it cannot use CSS itself). */
export function readChartPalette(themeId: string): ChartPalette {
  const style = getComputedStyle(document.documentElement);
  const accent = cssVar(style, '--accent', '#2563eb');
  const accent2 = cssVar(style, '--accent-2', '#0891b2');
  const accent3 = cssVar(style, '--accent-3', '#059669');
  const danger = cssVar(style, '--danger', '#e11d48');
  // Red is reserved for "bad" (thresholds, SOFR − IORB above zero), so it is not part of the line colours.
  const series = [accent, accent2, accent3, ...FALLBACK_SERIES]
    .filter((color, i, all) => all.indexOf(color) === i);
  return {
    themeId,
    text: cssVar(style, '--text-primary', '#111'),
    textMuted: cssVar(style, '--text-muted', '#888'),
    grid: cssVar(style, '--border', '#ddd'),
    border: cssVar(style, '--border-mid', '#ccc'),
    background: cssVar(style, '--panel-bg', '#fff'),
    tooltipBackground: cssVar(style, '--panel-bg-2', '#fff'),
    danger,
    warning: '#d99a00',
    success: accent3,
    series,
  };
}

/** The palette of the current theme; recomputed when the theme changes. */
export function useChartPalette(): ChartPalette {
  const [themeId] = useTheme();
  return useMemo(() => readChartPalette(themeId), [themeId]);
}
