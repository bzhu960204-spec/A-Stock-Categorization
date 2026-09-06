import { useEffect, useRef, useState } from 'react';
import { THEMES } from './themes';
import { useTheme } from './useTheme';
import { useEscapeKey } from './useEscapeKey';

const GROUP_LABELS: Record<'dark' | 'light', string> = {
  dark: '深色',
  light: '浅色',
};

/** Dropdown selector for switching between the available color themes. */
export function ThemePicker() {
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEscapeKey(() => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const darkThemes = THEMES.filter((t) => t.group === 'dark');
  const lightThemes = THEMES.filter((t) => t.group === 'light');

  return (
    <div className="theme-picker" ref={ref}>
      <button
        type="button"
        className={`icon-btn theme-picker-trigger${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="切换主题"
      >
        <span className="theme-dot" style={{ ['--tp-swatch' as string]: current.swatch }} />
        {current.label}
      </button>
      {open && (
        <div className="theme-picker-menu">
          {([['dark', darkThemes], ['light', lightThemes]] as const).map(([group, items]) => (
            <div key={group}>
              <div className="theme-picker-group-label">{GROUP_LABELS[group]}</div>
              {items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-picker-option${t.id === theme ? ' active' : ''}`}
                  onClick={() => {
                    setTheme(t.id);
                    setOpen(false);
                  }}
                >
                  <span className="theme-dot" style={{ background: t.swatch }} />
                  {t.label}
                  {t.id === theme && <span className="theme-check">✓</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
