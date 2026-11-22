import { useMemo } from 'react';
import type { MvMarketRow, MvMarketWindowKey } from '../../../api';
import { EChart } from '../../liquidity/charts/EChart';
import { useChartPalette } from '../../liquidity/charts/chartPalette';
import type { ECOption } from '../../liquidity/charts/echartsCore';
import { formatMvValue } from '../mvUtils';

interface Props {
  rows: MvMarketRow[];
  window: MvMarketWindowKey;
  height?: number;
}

interface TooltipParam {
  dataIndex: number;
}

/** Current PE against each market's μ ± σ (dark) and μ ± 2σ (light) range, drawn as stacked bars on a transparent base. */
export function MarketRangeChart({ rows, window, height = 340 }: Props) {
  const palette = useChartPalette();

  const option = useMemo<ECOption>(() => {
    const stats = rows.map(r => r.windows[window]);
    const num = (v: number | null | undefined) => (v == null ? null : v);
    const lowOf = (i: number) => (stats[i]?.avg != null && stats[i]?.sd != null ? stats[i].avg - 2 * stats[i].sd : null);
    const bar = (name: string, data: (number | null)[], opacity: number, hidden = false) => ({
      name, type: 'bar' as const, stack: 'range', barWidth: 34, silent: true, data,
      itemStyle: { color: hidden ? 'transparent' : palette.series[0], opacity: hidden ? 1 : opacity },
    });
    const sdOf = (i: number, k: number) => (stats[i]?.sd == null ? null : k * stats[i].sd);

    return {
      animation: false,
      grid: { left: 12, right: 24, top: 44, bottom: 28, containLabel: true },
      legend: { top: 4, data: ['μ ± 2σ', 'μ ± 1σ', '均值 μ', '当前 PE'] },
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'shadow' },
        formatter: raw => {
          const first = (Array.isArray(raw) ? raw : [raw])[0] as unknown as TooltipParam;
          const row = rows[first.dataIndex];
          const w = row?.windows[window];
          if (!row) return '';
          const z = w?.z == null ? '—' : w.z.toFixed(2);
          return `${row.name}（${window}）<br/>当前 PE: <b>${formatMvValue(row.pe, 'x')}</b><br/>均值 μ: ${formatMvValue(w?.avg, 'x')} · σ: ${formatMvValue(w?.sd, 'x')}<br/>z: ${z}${w?.label ? `（${w.label}）` : ''}`;
        },
      },
      xAxis: { type: 'category', data: rows.map(r => r.name), axisTick: { alignWithLabel: true } },
      yAxis: { type: 'value', name: 'PE (x)', nameTextStyle: { align: 'left' } },
      series: [
        bar('base', rows.map((_, i) => lowOf(i)), 0, true),
        bar('μ ± 2σ', rows.map((_, i) => sdOf(i, 1)), 0.18),
        bar('μ ± 1σ', rows.map((_, i) => sdOf(i, 2)), 0.45),
        bar('μ ± 2σ', rows.map((_, i) => sdOf(i, 1)), 0.18),
        {
          name: '均值 μ', type: 'scatter', symbol: 'rect', symbolSize: [44, 3], z: 5, silent: true,
          itemStyle: { color: palette.text }, data: rows.map((_, i) => num(stats[i]?.avg)),
        },
        {
          name: '当前 PE', type: 'scatter', symbolSize: 13, z: 6, silent: true,
          itemStyle: { color: palette.danger, borderColor: palette.text, borderWidth: 1 },
          label: { show: true, position: 'right', color: palette.text, formatter: p => (typeof p.value === 'number' ? p.value.toFixed(1) : '') },
          data: rows.map(r => num(r.pe)),
        },
      ],
    };
  }, [rows, window, palette]);

  return <EChart option={option} height={height} label="多市场当前 PE 与历史区间对比图" />;
}
