import { useCallback, useState, type MouseEvent } from 'react';

export type TipLine = { label: string; value: string };
export interface HoverTipState { lines: TipLine[]; x: number; y: number; above: boolean }

/** Fixed-position tooltip anchored to the hovered element (flips above it in the lower part of the screen). */
export function useHoverTip() {
  const [tip, setTip] = useState<HoverTipState | null>(null);
  const open = useCallback((e: MouseEvent<HTMLElement>, lines: TipLine[]) => {
    const r = e.currentTarget.getBoundingClientRect();
    const above = r.bottom > window.innerHeight * 0.55;
    setTip({ lines, x: r.right + 8, y: above ? r.top : r.bottom + 4, above });
  }, []);
  const close = useCallback(() => setTip(null), []);
  return { tip, open, close };
}

export type OpenTip = ReturnType<typeof useHoverTip>['open'];
