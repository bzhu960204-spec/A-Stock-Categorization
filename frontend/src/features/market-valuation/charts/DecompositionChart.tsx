import { useMemo } from 'react';
import type { MvDecompositionRow } from '../../../api';
import { EChart } from '../../liquidity/charts/EChart';
import { useChartPalette } from '../../liquidity/charts/chartPalette';
import type { ECOption } from '../../liquidity/charts/echartsCore';
import { formatSignedPercent } from '../mvUtils';

export type DecompositionBasis = 'ttm' | 'cape' | 'forward';

interface Props {
  rows: MvDecompositionRow[];
  basis: DecompositionBasis;
  height?: number;
}

/** Index return split into earnings growth and valuation change (stacked), with the total as a marker. */
export function DecompositionChart({ rows, basis, height = 320 }: Props) {
  const palette = useChartPalette();

  const option = useMemo<ECOption>(() => {
    const parts = rows.map(r => r[basis]);
    const pick = (key: 'earnings' | 'valuation' | 'total') => parts.map(p => (p ? p[key] : null));
    return {
      animation: false,
      grid: { left: 12, right: 24, top: 44, bottom: 28, containLabel: true },
      legend: { top: 4, data: ['盈利贡献', '估值贡献', '总回报'] },
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'shadow' },
        formatter: raw => {
          const first = (Array.isArray(raw) ? raw : [raw])[0] as unknown as { dataIndex: number };
          const row = rows[first.dataIndex];
          const p = row?.[basis];
          if (!row || !p) return row ? `${row.horizon}：暂无数据` : '';
          return `${row.horizon}（${row.startDate} ~ ${row.endDate}）<br/>总回报: <b>${formatSignedPercent(p.total)}</b><br/>盈利贡献: ${formatSignedPercent(p.earnings)}<br/>估值贡献: ${formatSignedPercent(p.valuation)}`;
        },
      },
      xAxis: { type: 'category', data: rows.map(r => r.horizon) },
      yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
      series: [
        { name: '盈利贡献', type: 'bar', stack: 'return', barMaxWidth: 46, itemStyle: { color: palette.series[0] }, data: pick('earnings') },
        { name: '估值贡献', type: 'bar', stack: 'return', barMaxWidth: 46, itemStyle: { color: palette.series[1] }, data: pick('valuation') },
        {
          name: '总回报', type: 'scatter', symbol: 'diamond', symbolSize: 12, z: 5,
          itemStyle: { color: palette.text },
          label: { show: true, position: 'top', color: palette.text, formatter: p => (typeof p.value === 'number' ? formatSignedPercent(p.value) : '') },
          data: pick('total'),
        },
      ],
    };
  }, [rows, basis, palette]);

  return <EChart option={option} height={height} label="回报拆解：盈利贡献与估值贡献" />;
}
