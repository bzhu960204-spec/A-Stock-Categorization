import { useMemo, useState } from 'react';
import type { MvMarketRow, MvMarketWindowKey, MvWindow } from '../../../api';
import { TimeSeriesChart, type ChartSeries } from '../../liquidity/charts/TimeSeriesChart';
import { MarketRangeChart } from '../charts/MarketRangeChart';
import { useMvMarkets } from '../mvQueries';
import {
  formatMvChange, formatMvValue, MARKET_WINDOWS, marketWindowFor, peChangeOneYear, zLabel, zTone,
} from '../mvUtils';
import { PanelShell } from '../SeriesPanel';
import styles from '../MarketValuation.module.css';

interface Props {
  window: MvWindow;
}

const NO_ROWS: MvMarketRow[] = [];

function ZCell({ row, windowKey }: { row: MvMarketRow; windowKey: MvMarketWindowKey }) {
  const w = row.windows[windowKey];
  if (!w || w.z == null) return <td className={styles.num}>—</td>;
  const label = w.label ?? zLabel(w.z);
  return (
    <td className={styles.num}>
      <span className={styles.zCell} data-tone={zTone(label)}>
        {w.z > 0 ? '+' : ''}{w.z.toFixed(2)}σ · {label}
      </span>
    </td>
  );
}

export function MarketsTab({ window }: Props) {
  const query = useMvMarkets();
  const rows = query.data ?? NO_ROWS;
  const [windowKey, setWindowKey] = useState<MvMarketWindowKey>(() => marketWindowFor(window));
  const [hidden, setHidden] = useState<string[]>([]);

  const historySeries = useMemo<ChartSeries[]>(
    () => rows
      .filter(r => !hidden.includes(r.market) && r.history.length > 0)
      .map(r => ({ key: r.market, name: r.name, unit: 'x', points: r.history, axis: 0 })),
    [rows, hidden],
  );
  const accumulating = rows.every(r => r.history.length < 2);

  if (query.isError) return <div className={styles.notice} data-tone="error">多市场数据加载失败</div>;
  if (query.isLoading) return <div className={styles.notice}>加载中…</div>;
  if (rows.length === 0) return <div className={styles.notice}>暂无多市场数据（worldperatio 尚未同步成功，请到设置页查看日志）</div>;

  return (
    <div className={styles.trends}>
      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>多市场 PE 与 z 分数</h3>
        <p className={styles.panelNote}>
          z = (当前 PE − 过去 N 年均值) / 标准差；z &gt; 2 昂贵，1 ~ 2 高估，±1 内合理，−2 ~ −1 低估，&lt; −2 便宜。
        </p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>市场</th><th>日期</th><th className={styles.num}>当前 PE</th>
              {MARKET_WINDOWS.map(k => <th key={k} className={styles.num}>{k} z 分数</th>)}
              <th className={styles.num}>近 1 年 PE 变化</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const change = peChangeOneYear(r.history);
              return (
                <tr key={r.market}>
                  <td>
                    {r.name}
                    {r.scopeNote && <span className={styles.badge} data-kind="warn" title="并非该国主要指数本身的 PE">{r.scopeNote}</span>}
                  </td>
                  <td className={styles.rowNote}>{r.date ?? '—'}</td>
                  <td className={styles.num}>{formatMvValue(r.pe, 'x')}</td>
                  {MARKET_WINDOWS.map(k => <ZCell key={k} row={r} windowKey={k} />)}
                  <td className={styles.num}>{change == null ? <span className={styles.muted}>积累中</span> : formatMvChange(change, 'x')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className={styles.footnote}>
          worldperatio 口径为基于 ETF 的 TTM PE；中国 / 中国香港 / 日本为市场级口径，并非沪深 300 / 恒生 / 日经 225 本身。
        </p>
      </section>

      <PanelShell title="当前 PE 与历史区间" note="浅色柱为 μ ± 2σ，深色柱为 μ ± 1σ，短横线为均值 μ，红点为当前 PE。">
        <div className={styles.rangeBar}>
          {MARKET_WINDOWS.map(k => (
            <button key={k} type="button" className={styles.chip} data-active={windowKey === k} onClick={() => setWindowKey(k)}>
              {k}
            </button>
          ))}
        </div>
        <MarketRangeChart rows={rows} window={windowKey} />
      </PanelShell>

      <PanelShell title="PE 历史曲线" note="worldperatio 没有原始历史序列，曲线自本模块上线起逐日积累。">
        <div className={styles.rangeBar}>
          {rows.map(r => (
            <label key={r.market} className={styles.check}>
              <input type="checkbox" checked={!hidden.includes(r.market)}
                     onChange={() => setHidden(h => (h.includes(r.market) ? h.filter(m => m !== r.market) : [...h, r.market]))} />
              {r.name}
            </label>
          ))}
        </div>
        {accumulating ? <div className={styles.notice}>历史曲线正在积累中（自上线起逐日记录，至少需要两天数据）</div>
          : historySeries.length === 0 ? <div className={styles.notice}>请至少勾选一个市场</div>
          : <TimeSeriesChart series={historySeries} label="多市场 PE 历史曲线" />}
      </PanelShell>
    </div>
  );
}
