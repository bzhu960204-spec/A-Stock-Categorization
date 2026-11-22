import { useMemo, type ReactNode } from 'react';
import type { MvCatalogEntry, MvWindow } from '../../api';
import { subtractMonths } from '../liquidity/liquidityUtils';
import { TimeSeriesChart, type ChartEvent } from '../liquidity/charts/TimeSeriesChart';
import { buildPanel, panelCodes, type PanelDef } from './mvPanels';
import { useMvSeries } from './mvQueries';
import { CHART_RANGES, type ChartRange } from './mvUtils';
import styles from './MarketValuation.module.css';

export function PanelShell({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>{title}</h3>
      {note && <p className={styles.panelNote}>{note}</p>}
      {children}
    </section>
  );
}

export function RangeBar({ range, onChange, children }: { range: ChartRange; onChange: (range: ChartRange) => void; children?: ReactNode }) {
  return (
    <div className={styles.rangeBar}>
      {CHART_RANGES.map(r => (
        <button key={r.id} type="button" className={styles.chip} data-active={range === r.id} onClick={() => onChange(r.id)}>
          {r.label}
        </button>
      ))}
      {children}
    </div>
  );
}

interface Props {
  def: PanelDef;
  from: string;
  to: string;
  window: MvWindow;
  catalog: Map<string, MvCatalogEntry>;
  events: ChartEvent[];
}

/** One preset chart: fetches its own series and overlays the window statistics when the panel asks for them. */
export function SeriesPanel({ def, from, to, window, catalog, events }: Props) {
  const longRange = from < subtractMonths(to, 240);
  const codes = useMemo(() => panelCodes(def, catalog, longRange), [def, catalog, longRange]);
  const query = useMvSeries(codes, from, to, def.statsCode ? window : undefined);
  const built = useMemo(
    () => (query.data ? buildPanel(def, query.data, catalog, longRange, window) : null),
    [def, query.data, catalog, longRange, window],
  );

  return (
    <PanelShell title={def.title} note={def.note}>
      {query.isError ? <div className={styles.notice} data-tone="error">加载失败</div>
        : query.isLoading || !built ? <div className={styles.notice}>加载中…</div>
        : built.series.length === 0 ? <div className={styles.notice}>该区间内暂无数据（可能仍在初始化，或需要先配置 FRED Key）</div>
        : <TimeSeriesChart series={built.series} markLines={built.markLines} events={events} label={def.title} />}
    </PanelShell>
  );
}
