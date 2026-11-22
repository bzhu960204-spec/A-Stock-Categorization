import { useMemo } from 'react';
import type { LineSeriesOption } from 'echarts/charts';
import { EChart } from '../charts/EChart';
import { useChartPalette } from '../charts/chartPalette';
import type { ECOption } from '../charts/echartsCore';
import { formatAxisValue, formatValue, todayIso } from '../liquidityUtils';
import { useLiquiditySeries, useQeEpisodes, useQeStageHistory } from '../liquidityQueries';
import { MAX_STAGE_LEVEL, STAGE_INFO, stageChartColor, stageStepPoints } from './qeRadarUtils';
import styles from '../Liquidity.module.css';

const HISTORY_FROM = '2007-01-01';
const STAGE_SERIES = 'stage';
const SOMA_SERIES = 'soma';

type MarkAreaData = NonNullable<NonNullable<LineSeriesOption['markArea']>['data']>;
type MarkLineData = NonNullable<NonNullable<LineSeriesOption['markLine']>['data']>;

interface TooltipItem {
  seriesId: string;
  seriesName: string;
  marker: string;
  value: [string, number];
}

export function StageHistoryChart() {
  const palette = useChartPalette();
  const today = todayIso();
  const history = useQeStageHistory(HISTORY_FROM);
  const soma = useLiquiditySeries(['SOMA_TOTAL'], HISTORY_FROM, today);
  const episodes = useQeEpisodes();

  const option = useMemo<ECOption | null>(() => {
    if (!history.data) return null;

    // Each level gets a band of ±0.5 around its row, clamped to the axis.
    const bands: MarkAreaData = STAGE_INFO.map(s => [
      { yAxis: Math.max(0, s.level - 0.5), itemStyle: { color: stageChartColor(s.level, palette), opacity: 0.1 } },
      { yAxis: Math.min(MAX_STAGE_LEVEL, s.level + 0.5) },
    ]);
    const episodeLines: MarkLineData = (episodes.data ?? [])
      .filter(e => e.keyDates.length > 0)
      .map(e => ({
        xAxis: e.keyDates[0],
        label: { formatter: e.name, position: 'insideEndTop' as const, color: palette.textMuted, rotate: 90, fontSize: 10 },
        lineStyle: { color: palette.textMuted, type: 'dotted' as const, width: 1 },
      }));

    const stageSeries: LineSeriesOption = {
      id: STAGE_SERIES,
      name: '放水阶段',
      type: 'line',
      step: 'end',
      showSymbol: false,
      yAxisIndex: 0,
      data: stageStepPoints(history.data),
      lineStyle: { width: 2, color: palette.series[0] },
      itemStyle: { color: palette.series[0] },
      markArea: { silent: true, data: bands },
      markLine: { silent: true, symbol: 'none', animation: false, data: episodeLines },
      z: 3,
    };
    const somaSeries: LineSeriesOption = {
      id: SOMA_SERIES,
      name: 'SOMA 总持仓',
      type: 'line',
      showSymbol: false,
      yAxisIndex: 1,
      sampling: 'lttb',
      data: soma.data?.SOMA_TOTAL ?? [],
      lineStyle: { width: 1.2, color: palette.series[1], opacity: 0.85 },
      itemStyle: { color: palette.series[1] },
      z: 2,
    };

    return {
      animation: false,
      grid: { left: 12, right: 12, top: 44, bottom: 64, containLabel: true },
      legend: { top: 4, data: ['放水阶段', 'SOMA 总持仓'] },
      tooltip: {
        trigger: 'axis',
        confine: true,
        formatter: raw => {
          const items = (Array.isArray(raw) ? raw : [raw]) as unknown as TooltipItem[];
          if (items.length === 0) return '';
          const rows = items.map(i => {
            const text = i.seriesId === STAGE_SERIES
              ? `L${i.value[1]} ${STAGE_INFO[i.value[1]]?.name ?? ''}`
              : formatValue(i.value[1], 'bn');
            return `${i.marker}${i.seriesName}: <b>${text}</b>`;
          });
          return `${items[0].value[0]}<br/>${rows.join('<br/>')}`;
        },
      },
      xAxis: { type: 'time' },
      yAxis: [
        {
          type: 'value', min: 0, max: MAX_STAGE_LEVEL, interval: 1, position: 'left',
          axisLabel: { formatter: (v: number) => `L${v}` },
          splitLine: { show: true },
        },
        {
          type: 'value', scale: true, position: 'right',
          axisLabel: { formatter: (v: number) => formatAxisValue(v, 'bn') },
          splitLine: { show: false },
          name: '十亿美元', nameTextStyle: { align: 'right' },
        },
      ],
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 10 }],
      series: [stageSeries, somaSeries],
    };
  }, [history.data, soma.data, episodes.data, palette]);

  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>历史阶梯（2007 年至今）</h3>
      <p className={styles.panelNote}>
        折线为按当前阈值回算的阶段（左轴）；虚线为历史事件的第一个关键日期；右轴叠加 SOMA 总持仓。边界与官方口径可能相差几周。
      </p>
      {history.isError ? <div className={styles.notice} data-tone="error">历史阶梯加载失败</div>
        : !option ? <div className={styles.notice}>加载中…</div>
        : history.data?.length === 0 ? <div className={styles.notice}>暂无历史阶梯数据（可能需要先完成全量同步）</div>
        : <EChart option={option} height={320} label="放水阶段历史" />}
    </section>
  );
}
