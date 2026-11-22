import { useMemo, useState } from 'react';
import type { MvCatalogEntry, MvWindow } from '../../../api';
import type { ChartEvent } from '../../liquidity/charts/TimeSeriesChart';
import { todayIso } from '../../liquidity/liquidityUtils';
import { DecompositionChart, type DecompositionBasis } from '../charts/DecompositionChart';
import { PbRoeScatterChart } from '../charts/PbRoeScatterChart';
import { PROFIT_PANELS, type PanelDef } from '../mvPanels';
import { useMvCatalog, useMvDecomposition, useMvEvents, useMvScatter } from '../mvQueries';
import { chartRangeStart, type ChartRange } from '../mvUtils';
import { PanelShell, RangeBar, SeriesPanel } from '../SeriesPanel';
import styles from '../MarketValuation.module.css';

interface Props {
  /** Indicator preselected by clicking an overview card. */
  focusCode: string | null;
  window: MvWindow;
  /** Date of the latest multpl sales / book value per share (they lag by more than a year). */
  fundamentalsDate: string | null;
}

const NO_CATALOG: MvCatalogEntry[] = [];
const NO_EVENTS: ChartEvent[] = [];
const BASES: { id: DecompositionBasis; label: string; note: string }[] = [
  { id: 'ttm', label: 'TTM', note: '盈利项 = 价格 / TTM PE（报告口径）' },
  { id: 'cape', label: 'CAPE', note: '盈利项 = 10 年平滑盈利（价格 / CAPE）' },
  { id: 'forward', label: '远期', note: '盈利项 = 隐含远期 EPS（FactSet，2017 年起）' },
];

function DecompositionPanel() {
  const query = useMvDecomposition();
  const [basis, setBasis] = useState<DecompositionBasis>('ttm');
  const rows = query.data ?? [];
  const hasData = rows.some(r => r[basis] != null);

  return (
    <PanelShell title="回报拆解：盈利增长 vs 估值扩张"
                note="总回报 = 盈利贡献 + 估值贡献（对数相加）；图中按各自对数收益换算成百分数，所以柱的高度相加不等于总回报（乘法关系）。">
      <div className={styles.rangeBar}>
        {BASES.map(b => (
          <button key={b.id} type="button" className={styles.chip} data-active={basis === b.id} onClick={() => setBasis(b.id)}>
            {b.label}
          </button>
        ))}
        <span className={styles.muted}>{BASES.find(b => b.id === basis)?.note}</span>
      </div>
      {query.isError ? <div className={styles.notice} data-tone="error">加载失败</div>
        : query.isLoading ? <div className={styles.notice}>加载中…</div>
        : !hasData ? <div className={styles.notice}>该口径暂无数据{basis === 'forward' ? '（FactSet 历史尚未覆盖起点）' : ''}</div>
        : <DecompositionChart rows={rows} basis={basis} />}
    </PanelShell>
  );
}

function ScatterPanel() {
  const query = useMvScatter();
  return (
    <PanelShell title="PB–ROE 散点"
                note="等 PE 线满足 PB = PE × ROE / 100。PB / PE = ROE；美股大量回购压缩净资产，PB 与 ROE 会被同时抬高。">
      {query.isError ? <div className={styles.notice} data-tone="error">加载失败</div>
        : query.isLoading ? <div className={styles.notice}>加载中…</div>
        : !query.data || query.data.length === 0 ? <div className={styles.notice}>暂无数据（需要 multpl 的 PB 与每股收益 / 净资产）</div>
        : <PbRoeScatterChart points={query.data} />}
    </PanelShell>
  );
}

export function ProfitabilityTab({ focusCode, window, fundamentalsDate }: Props) {
  const today = todayIso();
  const [range, setRange] = useState<ChartRange>('10Y');
  const [showEvents, setShowEvents] = useState(false);

  const from = chartRangeStart(range, today);
  const catalog = useMvCatalog().data ?? NO_CATALOG;
  const byCode = useMemo(() => new Map(catalog.map(c => [c.code, c])), [catalog]);
  const focusDef = useMemo<PanelDef | null>(
    () => (focusCode ? { id: `focus-${focusCode}`, title: `所选指标：${byCode.get(focusCode)?.name ?? focusCode}`, series: [{ code: focusCode }] } : null),
    [focusCode, byCode],
  );

  const eventsQuery = useMvEvents(from, today, showEvents);
  const events = useMemo<ChartEvent[]>(
    () => (showEvents ? (eventsQuery.data ?? []).map(e => ({ date: e.eventDate, title: e.title })) : NO_EVENTS),
    [showEvents, eventsQuery.data],
  );

  return (
    <div className={styles.trends}>
      <RangeBar range={range} onChange={setRange}>
        <label className={styles.check}>
          <input type="checkbox" checked={showEvents} onChange={e => setShowEvents(e.target.checked)} />
          叠加市场事件
        </label>
      </RangeBar>
      {fundamentalsDate && (
        <p className={styles.footnote}>multpl 每股销售额 / 净资产的最新数据日期为 {fundamentalsDate}（滞后较严重），净利率与 ROE 只到该日期。</p>
      )}
      {focusDef && <SeriesPanel def={focusDef} from={from} to={today} window={window} catalog={byCode} events={events} />}
      {PROFIT_PANELS.map(def => (
        <SeriesPanel key={def.id} def={def} from={from} to={today} window={window} catalog={byCode} events={events} />
      ))}
      <DecompositionPanel />
      <ScatterPanel />
    </div>
  );
}
