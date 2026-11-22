import type { LiquidityPoint } from '../../api';

interface Props {
  points: LiquidityPoint[];
  color: string;
  width?: number;
  height?: number;
}

/** Tiny dependency-free line chart for the overview cards (ECharts is reserved for the trend tab). */
export function Sparkline({ points, color, width = 120, height = 32 }: Props) {
  if (points.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const step = (width - pad * 2) / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(pad + i * step).toFixed(1)},${(height - pad - ((p.value - min) / span) * (height - pad * 2)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" style={{ stroke: color }} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
