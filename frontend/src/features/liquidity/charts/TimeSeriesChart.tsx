import { useMemo } from 'react';
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts';
import { formatAxisValue, formatValue } from '../liquidityUtils';
import { EChart } from './EChart';
import { useChartPalette } from './chartPalette';
import type { ECOption } from './echartsCore';

type MarkLineData = NonNullable<LineSeriesOption['markLine']>['data'];

export interface ChartSeries {
  /** Unique within the chart. */
  key: string;
  name: string;
  unit: string;
  points: [string, number][];
  /** 0 = left axis, 1 = right axis. */
  axis: 0 | 1;
  type?: 'line' | 'bar';
  /** Stair-step line, for policy rates that only change on decision days. */
  step?: boolean;
  /** Series that are stacked together share the same stack name. */
  stack?: string;
  /** Filled area under the line (used for the percentile band). */
  area?: boolean;
  /** Invisible helper series (the lower edge of a band): kept out of the legend and the tooltip. */
  helper?: boolean;
  /** Colour the parts of the line above zero red. */
  redAboveZero?: boolean;
}

export interface ChartMarkLine {
  axis: 0 | 1;
  value: number;
  label: string;
  tone: 'danger' | 'warning' | 'muted';
}

export interface ChartEvent {
  date: string;
  title: string;
}

interface Props {
  series: ChartSeries[];
  markLines?: ChartMarkLine[];
  events?: ChartEvent[];
  height?: number;
  label: string;
}

interface TooltipItem {
  seriesName: string;
  marker: string;
  value: [string, number];
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

const NO_MARK_LINES: ChartMarkLine[] = [];
const NO_EVENTS: ChartEvent[] = [];
const VISUAL_MAP_BOUND = 1000;

export function TimeSeriesChart({ series, markLines = NO_MARK_LINES, events = NO_EVENTS, height = 300, label }: Props) {
  const palette = useChartPalette();

  const option = useMemo<ECOption>(() => {
    const visible = series.filter(s => !s.helper);
    const unitOfAxis: [string, string] = ['', ''];
    for (const s of visible) if (!unitOfAxis[s.axis]) unitOfAxis[s.axis] = s.unit;
    const hasRightAxis = visible.some(s => s.axis === 1);
    const unitByName = new Map(visible.map(s => [s.name, s.unit]));
    const toneColor = { danger: palette.danger, warning: palette.warning, muted: palette.textMuted };

    const colorOf = (s: ChartSeries) => palette.series[series.indexOf(s) % palette.series.length];
    const markHost = (axis: 0 | 1) => visible.find(s => s.axis === axis) ?? visible[0];
    const eventHost = visible[0];

    const seriesOptions = series.map((s): BarSeriesOption | LineSeriesOption => {
      const color = colorOf(s);
      const lines = markLines.filter(m => markHost(m.axis) === s);
      const markData: MarkLineData = [
        ...lines.map(m => ({
          yAxis: m.value,
          label: { formatter: m.label, position: 'insideEndTop' as const, color: toneColor[m.tone] },
          lineStyle: { color: toneColor[m.tone], type: 'dashed' as const, width: 1 },
        })),
        ...(s === eventHost ? events.map(e => ({
          xAxis: e.date,
          label: { formatter: e.title, position: 'insideEndTop' as const, color: palette.textMuted, rotate: 90 },
          lineStyle: { color: palette.textMuted, type: 'dotted' as const, width: 1 },
        })) : []),
      ];
      const common = {
        id: s.key,
        name: s.name,
        yAxisIndex: s.axis,
        data: s.points,
        stack: s.stack,
        silent: s.helper,
        markLine: markData.length > 0 ? { silent: true, symbol: 'none', animation: false, data: markData } : undefined,
      };
      if (s.type === 'bar') return { ...common, type: 'bar', barMaxWidth: 12, itemStyle: { color } };
      return {
        ...common,
        type: 'line',
        showSymbol: false,
        step: s.step ? 'end' : false,
        sampling: 'lttb',
        // An explicit line colour would override the visualMap gradient, so the red-above-zero series leaves it unset.
        lineStyle: s.redAboveZero ? { width: 1.5 } : { width: 1.5, color, opacity: s.helper ? 0 : 1 },
        itemStyle: s.redAboveZero ? undefined : { color },
        areaStyle: s.area ? { color, opacity: 0.18 } : undefined,
      };
    });

    const redIndex = series.findIndex(s => s.redAboveZero);
    const yAxis = ([0, 1] as const).slice(0, hasRightAxis ? 2 : 1).map(axis => {
      const unit = unitOfAxis[axis];
      const hasBars = visible.some(s => s.axis === axis && s.type === 'bar');
      return {
        type: 'value' as const,
        scale: !hasBars,
        position: axis === 0 ? ('left' as const) : ('right' as const),
        axisLabel: { formatter: (v: number) => formatAxisValue(v, unit) },
        splitLine: { show: axis === 0 },
        name: unit === 'bn' ? '十亿美元' : unit,
        nameTextStyle: { align: axis === 0 ? ('left' as const) : ('right' as const) },
      };
    });

    return {
      animation: false,
      grid: { left: 12, right: 12, top: 44, bottom: 64, containLabel: true },
      legend: { top: 4, type: 'scroll', data: visible.map(s => s.name) },
      tooltip: {
        trigger: 'axis',
        confine: true,
        formatter: raw => {
          const items = (Array.isArray(raw) ? raw : [raw]) as unknown as TooltipItem[];
          const shown = items.filter(i => unitByName.has(i.seriesName));
          if (shown.length === 0) return '';
          const rows = shown.map(i => `${i.marker}${escapeHtml(i.seriesName)}: <b>${formatValue(i.value[1], unitByName.get(i.seriesName) ?? '')}</b>`);
          return `${shown[0].value[0]}<br/>${rows.join('<br/>')}`;
        },
      },
      xAxis: { type: 'time' },
      yAxis,
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 10 }],
      visualMap: redIndex >= 0
        ? {
            show: false, type: 'piecewise', seriesIndex: redIndex, dimension: 1,
            // Both pieces need finite bounds: ECharts builds the colour gradient from finite piece edges only
            // and throws when every edge is infinite.
            pieces: [
              { gt: -VISUAL_MAP_BOUND, lte: 0, color: colorOf(series[redIndex]) },
              { gt: 0, lte: VISUAL_MAP_BOUND, color: palette.danger },
            ],
          }
        : undefined,
      series: seriesOptions,
    };
  }, [series, markLines, events, palette]);

  return <EChart option={option} height={height} label={label} />;
}
