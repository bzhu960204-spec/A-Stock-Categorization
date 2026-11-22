import { useMemo } from 'react';
import { TimeSeriesChart } from '../charts/TimeSeriesChart';
import { useLiquidityCatalog, useLiquiditySeries } from '../liquidityQueries';
import { rangeStart, todayIso } from '../liquidityUtils';
import { buildPanelSeries, PANELS } from '../trendPanels';
import styles from '../Liquidity.module.css';

const NET_LIQ_PANEL = PANELS.find(p => p.id === 'netliq')!;
const CODES = NET_LIQ_PANEL.series.map(s => s.code);

export function NetLiquidityChart() {
  const today = todayIso();
  const from = rangeStart('3Y', today);
  const { data, isLoading, isError } = useLiquiditySeries(CODES, from, today);
  const catalog = useLiquidityCatalog().data;
  const catalogByCode = useMemo(() => new Map((catalog ?? []).map(c => [c.code, c])), [catalog]);
  const series = useMemo(
    () => (data ? buildPanelSeries(NET_LIQ_PANEL, data, catalogByCode, []) : []),
    [data, catalogByCode],
  );

  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>净流动性（近 3 年）</h3>
      <p className={styles.panelNote}>
        净流动性 = 美联储总资产 − TGA − ON RRP。净流动性上升可能来自美联储扩表，也可能来自 TGA 下降（财政花钱），后者不是 QE。
      </p>
      {isError ? <div className={styles.notice} data-tone="error">加载失败</div>
        : isLoading ? <div className={styles.notice}>加载中…</div>
        : series.length === 0 ? <div className={styles.notice}>暂无数据（需要 FRED Key 并完成同步）</div>
        : <TimeSeriesChart series={series} label="净流动性" height={260} />}
    </section>
  );
}
