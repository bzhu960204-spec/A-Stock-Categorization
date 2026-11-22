import { useMemo } from 'react';
import type { MvScatterPoint } from '../../../api';
import { EChart } from '../../liquidity/charts/EChart';
import { useChartPalette } from '../../liquidity/charts/chartPalette';
import type { ECOption } from '../../liquidity/charts/echartsCore';

interface Props {
  points: MvScatterPoint[];
  height?: number;
}

/** Era boundaries live in the backend; the colours follow design §6.6 (grey, light blue, dark blue). */
const ERAS: { id: MvScatterPoint['era']; label: string; color: string }[] = [
  { id: '2000-2008', label: '2000–2008', color: '#94a3b8' },
  { id: '2009-2019', label: '2009–2019', color: '#6cb6ff' },
  { id: '2020+', label: '2020 至今', color: '#1d4ed8' },
];
const ISO_PE_LINES = [15, 20, 25, 30];

const arrow = (from: MvScatterPoint, to: MvScatterPoint): [{ coord: number[] }, { coord: number[] }] => [
  { coord: [from.roe, from.pb] },
  { coord: [to.roe, to.pb] },
];

/** PB against ROE (PB / PE = ROE), coloured by era, with iso-PE lines and the latest point highlighted. */
export function PbRoeScatterChart({ points, height = 460 }: Props) {
  const palette = useChartPalette();

  const option = useMemo<ECOption>(() => {
    const history = points.filter(p => p.era !== 'LATEST');
    const latest = points.find(p => p.era === 'LATEST') ?? null;
    const previous = history.length > 0 ? history[history.length - 1] : null;
    const toData = (list: MvScatterPoint[]) => list.map(p => ({ value: [p.roe, p.pb, p.date] }));

    const roes = points.map(p => p.roe);
    const pbs = points.map(p => p.pb);
    const xMin = roes.length > 0 ? Math.max(0, Math.floor(Math.min(...roes) - 1)) : 0;
    const xMax = roes.length > 0 ? Math.ceil(Math.max(...roes) + 1) : 30;
    const yMax = pbs.length > 0 ? Math.ceil(Math.max(...pbs) * 1.15) : 10;

    return {
      animation: false,
      grid: { left: 12, right: 40, top: 40, bottom: 36, containLabel: true },
      legend: { top: 4, data: [...ERAS.map(e => e.label), '最新'] },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: raw => {
          const value = (raw as unknown as { value: [number, number, string] }).value;
          return `${value[2]}<br/>ROE: <b>${value[0].toFixed(2)}%</b><br/>PB: <b>${value[1].toFixed(2)}x</b>`;
        },
      },
      xAxis: {
        type: 'value', min: xMin, max: xMax, name: 'ROE (%)', nameLocation: 'middle', nameGap: 26,
        axisLabel: { formatter: '{value}%' }, splitLine: { show: false },
      },
      yAxis: { type: 'value', min: 0, max: yMax, name: 'PB (x)', nameTextStyle: { align: 'left' } },
      series: [
        ...ISO_PE_LINES.map(pe => ({
          name: `PE ${pe}x`,
          type: 'line' as const,
          silent: true,
          showSymbol: false,
          lineStyle: { color: palette.textMuted, type: 'dashed' as const, width: 1, opacity: 0.7 },
          data: [
            { value: [xMin, (pe * xMin) / 100] },
            { value: [xMax, (pe * xMax) / 100], label: { show: true, formatter: `PE ${pe}x`, position: 'left' as const, color: palette.textMuted } },
          ],
        })),
        ...ERAS.map(era => ({
          name: era.label,
          type: 'scatter' as const,
          symbolSize: 8,
          itemStyle: { color: era.color, opacity: 0.8 },
          data: toData(history.filter(p => p.era === era.id)),
        })),
        {
          name: '最新',
          type: 'scatter' as const,
          symbolSize: 18,
          itemStyle: { color: palette.danger, borderColor: palette.text, borderWidth: 1 },
          data: latest ? toData([latest]) : [],
          label: { show: true, formatter: latest?.date ?? '', position: 'top' as const, color: palette.text },
          markLine: latest && previous
            ? {
                silent: true, animation: false, symbol: ['none', 'arrow'],
                lineStyle: { color: palette.danger, width: 2 },
                data: [arrow(previous, latest)],
              }
            : undefined,
        },
      ],
    };
  }, [points, palette]);

  return <EChart option={option} height={height} label="PB 与 ROE 散点图" />;
}
