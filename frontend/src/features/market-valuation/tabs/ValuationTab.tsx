import { useMemo, useState } from 'react';
import type { MvCatalogEntry, MvGroup, MvWindow } from '../../../api';
import type { ChartEvent } from '../../liquidity/charts/TimeSeriesChart';
import { TimeSeriesChart } from '../../liquidity/charts/TimeSeriesChart';
import { assignAxes, MAX_CUSTOM_SERIES, todayIso } from '../../liquidity/liquidityUtils';
import { buildCustomSeries, VALUATION_PANELS } from '../mvPanels';
import { useMvCatalog, useMvEvents, useMvSeries } from '../mvQueries';
import { chartRangeStart, type ChartRange } from '../mvUtils';
import { PanelShell, RangeBar, SeriesPanel } from '../SeriesPanel';
import styles from '../MarketValuation.module.css';

interface Props {
  /** Indicators preselected by clicking an overview card. */
  focusCodes: string[];
  window: MvWindow;
}

const NO_CATALOG: MvCatalogEntry[] = [];
const NO_CODES: string[] = [];
const PICKER_GROUPS: [MvGroup, string][] = [
  ['VALUATION', '估值'], ['RELATIVE', '相对估值'], ['PROFITABILITY', '盈利能力'], ['STRUCTURE', '结构与情绪'],
  ['PRICE', '价格'], ['MACRO', '宏观'], ['FACTSET', 'FactSet'], ['MARKETS', '多市场'], ['MANUAL', '手动序列'],
];

function CustomPanel({ codes, onChange, from, to, catalog, byCode, events }: {
  codes: string[]; onChange: (codes: string[]) => void; from: string; to: string;
  catalog: MvCatalogEntry[]; byCode: Map<string, MvCatalogEntry>; events: ChartEvent[];
}) {
  const [open, setOpen] = useState(false);
  const query = useMvSeries(codes.length > 0 ? codes : NO_CODES, from, to);
  const axes = useMemo(() => assignAxes(codes.map(c => byCode.get(c)?.unit ?? '')), [codes, byCode]);
  const series = useMemo(
    () => (query.data && axes ? buildCustomSeries(codes, query.data.series, byCode, axes) : []),
    [query.data, codes, byCode, axes],
  );

  function toggle(code: string) {
    if (codes.includes(code)) onChange(codes.filter(c => c !== code));
    else if (codes.length < MAX_CUSTOM_SERIES) onChange([...codes, code]);
  }

  return (
    <PanelShell title="自定义面板" note={`任选最多 ${MAX_CUSTOM_SERIES} 个指标，按单位自动分配左右两个轴（最多两种单位）。`}>
      <div className={styles.customBar}>
        <button type="button" className="cancel-btn" onClick={() => setOpen(v => !v)}>{open ? '收起指标列表' : '选择指标'}</button>
        <span className={styles.muted}>已选 {codes.length}/{MAX_CUSTOM_SERIES}</span>
        {codes.length > 0 && <button type="button" className="cancel-btn" onClick={() => onChange([])}>清空</button>}
      </div>
      {open && (
        <div className={styles.picker}>
          {PICKER_GROUPS.map(([group, label]) => {
            const items = catalog.filter(c => c.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <div className={styles.pickerGroupTitle}>{label}</div>
                {items.map(item => (
                  <label key={item.code} className={styles.check} title={item.description ?? undefined}>
                    <input type="checkbox" checked={codes.includes(item.code)} onChange={() => toggle(item.code)}
                           disabled={!codes.includes(item.code) && codes.length >= MAX_CUSTOM_SERIES} />
                    {item.name} <span className={styles.muted}>{item.unit}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {codes.length === 0 ? <div className={styles.notice}>请选择要绘制的指标</div>
        : !axes ? <div className={styles.notice} data-tone="warn">所选指标包含超过两种单位，图表只有左右两个轴，请取消部分指标。</div>
        : query.isLoading ? <div className={styles.notice}>加载中…</div>
        : series.length === 0 ? <div className={styles.notice}>该区间内暂无数据</div>
        : <TimeSeriesChart series={series} events={events} label="自定义面板" />}
    </PanelShell>
  );
}

export function ValuationTab({ focusCodes, window }: Props) {
  const today = todayIso();
  const [range, setRange] = useState<ChartRange>('10Y');
  const [showEvents, setShowEvents] = useState(false);
  const [customCodes, setCustomCodes] = useState<string[]>(focusCodes);

  const from = chartRangeStart(range, today);
  const catalog = useMvCatalog().data ?? NO_CATALOG;
  const byCode = useMemo(() => new Map(catalog.map(c => [c.code, c])), [catalog]);

  const eventsQuery = useMvEvents(from, today, showEvents);
  const events = useMemo<ChartEvent[]>(
    () => (showEvents ? (eventsQuery.data ?? []).map(e => ({ date: e.eventDate, title: e.title })) : []),
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
      <CustomPanel codes={customCodes} onChange={setCustomCodes} from={from} to={today} catalog={catalog} byCode={byCode} events={events} />
      {VALUATION_PANELS.map(def => (
        <SeriesPanel key={def.id} def={def} from={from} to={today} window={window} catalog={byCode} events={events} />
      ))}
    </div>
  );
}
