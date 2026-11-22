import { useMemo, useState, type ReactNode } from 'react';
import type { LiquidityCatalogEntry } from '../../../api';
import { TimeSeriesChart, type ChartEvent, type ChartSeries } from '../charts/TimeSeriesChart';
import { useLiquidityCatalog, useLiquidityEvents, useLiquiditySeries } from '../liquidityQueries';
import {
  assignAxes, MAX_CUSTOM_SERIES, RANGE_PRESETS, rangeStart, todayIso, type RangePreset,
} from '../liquidityUtils';
import { buildCustomSeries, buildPanelSeries, panelCodes, PANELS, type PanelDef } from '../trendPanels';
import styles from '../Liquidity.module.css';

interface Props {
  /** Indicators preselected by clicking an overview card. */
  focusCodes: string[];
}

const NO_CODES: string[] = [];
const NO_CATALOG: LiquidityCatalogEntry[] = [];

function usePanelData(codes: string[], from: string, to: string) {
  const query = useLiquiditySeries(codes, from, to);
  return { data: query.data, loading: query.isLoading, error: query.isError };
}

function PanelShell({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>{title}</h3>
      {note && <p className={styles.panelNote}>{note}</p>}
      {children}
    </section>
  );
}

function PresetPanel({ def, from, to, catalog, manualCodes, events }: {
  def: PanelDef; from: string; to: string; catalog: Map<string, LiquidityCatalogEntry>;
  manualCodes: string[]; events: ChartEvent[];
}) {
  const codes = useMemo(() => panelCodes(def, manualCodes), [def, manualCodes]);
  const { data, loading, error } = usePanelData(codes, from, to);
  const series = useMemo<ChartSeries[]>(
    () => (data ? buildPanelSeries(def, data, catalog, manualCodes) : []),
    [def, data, catalog, manualCodes],
  );

  return (
    <PanelShell title={def.title} note={def.note}>
      {error ? <div className={styles.notice} data-tone="error">加载失败</div>
        : loading ? <div className={styles.notice}>加载中…</div>
        : series.length === 0 ? <div className={styles.notice}>该区间内暂无数据（可能需要先配置 FRED Key 或录入手动序列）</div>
        : <TimeSeriesChart series={series} markLines={def.markLines} events={events} label={def.title} />}
    </PanelShell>
  );
}

function CustomPanel({ codes, onChange, from, to, catalog, events }: {
  codes: string[]; onChange: (codes: string[]) => void; from: string; to: string;
  catalog: LiquidityCatalogEntry[]; events: ChartEvent[];
}) {
  const [open, setOpen] = useState(false);
  const byCode = useMemo(() => new Map(catalog.map(c => [c.code, c])), [catalog]);
  const { data, loading } = usePanelData(codes.length > 0 ? codes : NO_CODES, from, to);
  const series = useMemo(() => (data ? buildCustomSeries(codes, data, byCode) : []), [data, codes, byCode]);

  function toggle(code: string) {
    if (codes.includes(code)) {
      onChange(codes.filter(c => c !== code));
      return;
    }
    if (codes.length >= MAX_CUSTOM_SERIES) return;
    onChange([...codes, code]);
  }

  const unitsOk = assignAxes(codes.map(c => byCode.get(c)?.unit ?? '')) !== null;
  const groups = [
    ['RATE', '利率'], ['SPREAD', '利差（bp）'], ['STOCK', '存量'], ['FACILITY', '联储工具'], ['CREDIT', '信用'],
    ['PRESSURE', '压力'], ['POLICY', '政策'], ['BALANCE_SHEET', '资产负债表'], ['MANUAL', '手动序列'],
  ] as const;

  return (
    <PanelShell title="自定义面板" note={`任选最多 ${MAX_CUSTOM_SERIES} 个指标，按单位自动分配左右两个轴（最多两种单位）。`}>
      <div className={styles.customBar}>
        <button type="button" className="cancel-btn" onClick={() => setOpen(v => !v)}>{open ? '收起指标列表' : '选择指标'}</button>
        <span className={styles.muted}>已选 {codes.length}/{MAX_CUSTOM_SERIES}</span>
        {codes.length > 0 && <button type="button" className="cancel-btn" onClick={() => onChange([])}>清空</button>}
      </div>
      {open && (
        <div className={styles.picker}>
          {groups.map(([group, label]) => {
            const items = catalog.filter(c => c.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className={styles.pickerGroup}>
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
        : !unitsOk ? <div className={styles.notice} data-tone="warn">所选指标包含超过两种单位，图表只有左右两个轴，请取消部分指标。</div>
        : loading ? <div className={styles.notice}>加载中…</div>
        : !series || series.length === 0 ? <div className={styles.notice}>该区间内暂无数据</div>
        : <TimeSeriesChart series={series} events={events} label="自定义面板" />}
    </PanelShell>
  );
}

export function TrendsTab({ focusCodes }: Props) {
  const today = todayIso();
  const [preset, setPreset] = useState<RangePreset | 'CUSTOM'>('1Y');
  const [customFrom, setCustomFrom] = useState(() => rangeStart('1Y', today));
  const [customTo, setCustomTo] = useState(today);
  const [showEvents, setShowEvents] = useState(false);
  const [customCodes, setCustomCodes] = useState<string[]>(focusCodes);

  const from = preset === 'CUSTOM' ? customFrom : rangeStart(preset, today);
  const to = preset === 'CUSTOM' ? customTo : today;
  const validRange = from <= to;

  const catalogQuery = useLiquidityCatalog();
  const catalog = catalogQuery.data ?? NO_CATALOG;
  const catalogByCode = useMemo(() => new Map(catalog.map(c => [c.code, c])), [catalog]);
  const manualCodes = useMemo(() => catalog.filter(c => c.kind === 'MANUAL').map(c => c.code), [catalog]);

  const eventsQuery = useLiquidityEvents(from, to, showEvents && validRange);
  const events = useMemo<ChartEvent[]>(
    () => (showEvents ? (eventsQuery.data ?? []).map(e => ({ date: e.eventDate, title: e.title })) : []),
    [showEvents, eventsQuery.data],
  );

  return (
    <div className={styles.trends}>
      <div className={styles.rangeBar}>
        {RANGE_PRESETS.map(p => (
          <button key={p.id} type="button" className={styles.chip} data-active={preset === p.id} onClick={() => setPreset(p.id)}>
            {p.label}
          </button>
        ))}
        <button type="button" className={styles.chip} data-active={preset === 'CUSTOM'} onClick={() => setPreset('CUSTOM')}>自定义</button>
        {preset === 'CUSTOM' && (
          <>
            <input type="date" className={styles.input} value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)} />
            <span className={styles.muted}>~</span>
            <input type="date" className={styles.input} value={customTo} min={customFrom} onChange={e => setCustomTo(e.target.value)} />
          </>
        )}
        <label className={styles.check}>
          <input type="checkbox" checked={showEvents} onChange={e => setShowEvents(e.target.checked)} />
          叠加市场事件
        </label>
      </div>

      {!validRange ? <div className={styles.notice} data-tone="warn">起始日期不能晚于结束日期</div> : (
        <>
          <CustomPanel codes={customCodes} onChange={setCustomCodes} from={from} to={to} catalog={catalog} events={events} />
          {PANELS.map(def => (
            <PresetPanel key={def.id} def={def} from={from} to={to} catalog={catalogByCode} manualCodes={manualCodes} events={events} />
          ))}
        </>
      )}
    </div>
  );
}
