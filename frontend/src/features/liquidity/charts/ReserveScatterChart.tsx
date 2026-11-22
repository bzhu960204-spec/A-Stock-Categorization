import { useMemo } from 'react';
import type { LiquidityScatterPoint } from '../../../api';
import { formatValue } from '../liquidityUtils';
import { EChart } from './EChart';
import { useChartPalette } from './chartPalette';
import type { ECOption } from './echartsCore';

/** Periods of the Goldman Sachs Exhibit 5 colouring; the boundaries live in the backend (LiquidityCalcService). */
const SCATTER_ERAS: { id: LiquidityScatterPoint['era']; label: string }[] = [
  { id: 'EARLY', label: '2018-04 ~ 2021-08' },
  { id: 'MID', label: '2021-09 ~ 2026-03' },
  { id: 'RECENT', label: '2026-04 ~ 至今' },
];

interface Props {
  points: LiquidityScatterPoint[];
  height?: number;
}

const CLIFF_RATIO = 11;
const TIGHT_2025_RATIO = 14;
const Y_MIN = -20;
const Y_MAX = 25;

/** A line segment between two weekly points (used as the "direction of travel" arrow). */
const arrow = (from: LiquidityScatterPoint, to: LiquidityScatterPoint): [{ coord: number[] }, { coord: number[] }] => [
  { coord: [from.ratio, from.tgcrIorb] },
  { coord: [to.ratio, to.tgcrIorb] },
];

export function ReserveScatterChart({ points, height = 460 }: Props) {
  const palette = useChartPalette();

  const option = useMemo<ECOption>(() => {
    const byEra = (era: LiquidityScatterPoint['era']) =>
      points.filter(p => p.era === era).map(p => ({ value: [p.ratio, p.tgcrIorb, p.weekEnd] }));
    const eraColor = { EARLY: palette.textMuted, MID: palette.series[0], RECENT: palette.series[1] };
    const eraOpacity = { EARLY: 0.55, MID: 0.4, RECENT: 0.95 };

    const latest = points.length > 0 ? points[points.length - 1] : null;
    const previous = points.length > 1 ? points[points.length - 2] : null;

    const guideLines = [
      {
        xAxis: CLIFF_RATIO,
        label: { formatter: '悬崖边缘 11%', position: 'insideEndTop' as const, color: palette.danger },
        lineStyle: { color: palette.danger, type: 'dashed' as const },
      },
      {
        xAxis: TIGHT_2025_RATIO,
        label: { formatter: '2025 年紧张 14%', position: 'insideEndTop' as const, color: palette.warning },
        lineStyle: { color: palette.warning, type: 'dashed' as const },
      },
      { yAxis: 0, label: { show: false }, lineStyle: { color: palette.textMuted, type: 'solid' as const, width: 1 } },
    ];

    return {
      animation: false,
      grid: { left: 12, right: 24, top: 40, bottom: 36, containLabel: true },
      legend: { top: 4, data: SCATTER_ERAS.map(e => e.label) },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: raw => {
          const value = (raw as unknown as { value: [number, number, string] }).value;
          return `周三 ${value[2]}<br/>准备金比例: <b>${formatValue(value[0], '%')}</b><br/>TGCR − IORB: <b>${formatValue(value[1], 'bp')}</b>`;
        },
      },
      xAxis: {
        type: 'value', scale: true, name: '(准备金 + RRP) / 银行总资产 (%)', nameLocation: 'middle', nameGap: 26,
        axisLabel: { formatter: '{value}%' },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value', name: 'TGCR − IORB (bp)', nameTextStyle: { align: 'left' }, axisLabel: { formatter: '{value}' },
        // Same visible range as the Goldman chart; a few 2018-2019 spikes above it are clipped.
        min: Y_MIN, max: Y_MAX,
      },
      series: [
        ...SCATTER_ERAS.map((era, i) => ({
          name: era.label,
          type: 'scatter' as const,
          clip: true,
          symbolSize: 8,
          itemStyle: { color: eraColor[era.id], opacity: eraOpacity[era.id] },
          data: byEra(era.id),
          markLine: i === 0 ? { silent: true, symbol: 'none', animation: false, data: guideLines } : undefined,
        })),
        ...(latest ? [{
          name: '最新一周',
          type: 'scatter' as const,
          symbolSize: 18,
          itemStyle: { color: palette.danger, borderColor: palette.text, borderWidth: 1 },
          data: [{ value: [latest.ratio, latest.tgcrIorb, latest.weekEnd] }],
          label: { show: true, formatter: latest.weekEnd, position: 'top' as const, color: palette.text },
          markLine: previous
            ? {
                silent: true, animation: false, symbol: ['none', 'arrow'],
                lineStyle: { color: palette.danger, width: 2 },
                data: [arrow(previous, latest)],
              }
            : undefined,
        }] : []),
      ],
    };
  }, [points, palette]);

  return <EChart option={option} height={height} label="准备金比例与 TGCR − IORB 散点图" />;
}
