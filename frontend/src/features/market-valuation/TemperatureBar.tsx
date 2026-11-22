import styles from './MarketValuation.module.css';

interface Props {
  value: number | null;
  level: string | null;
  windowText: string;
}

const TICKS = [0, 20, 40, 60, 80, 100];

/** 0–100 gradient bar (green → red) with a marker at the current temperature; pure CSS. */
export function TemperatureBar({ value, level, windowText }: Props) {
  const position = value == null ? null : Math.min(100, Math.max(0, value));
  return (
    <div className={styles.temperature}>
      <div className={styles.temperatureTitle}>
        🌡️ {value == null ? '样本不足，暂无法计算' : `${Math.round(value)} · ${level ?? '—'}`}
        <span className={styles.muted}>（{windowText}窗口）</span>
      </div>
      <div className={styles.temperatureTrack} role="img" aria-label={value == null ? '估值温度：暂无' : `估值温度 ${Math.round(value)} / 100`}>
        {position != null && <div className={styles.temperatureMarker} style={{ left: `${position}%` }} />}
      </div>
      <div className={styles.temperatureTicks} aria-hidden="true">
        {TICKS.map(t => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}
