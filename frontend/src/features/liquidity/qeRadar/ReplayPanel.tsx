import { useMemo, useState } from 'react';
import type { LiquidityCatalogEntry, QeReplay } from '../../../api';
import { TimeSeriesChart, type ChartEvent, type ChartSeries } from '../charts/TimeSeriesChart';
import { useLiquidityCatalog, useQeEpisodes, useQeReplay } from '../liquidityQueries';
import { addDays } from '../liquidityUtils';
import { formatLeadDays, sortLeads, STAGE_INFO, stageCssColor, stageInfo } from './qeRadarUtils';
import styles from '../Liquidity.module.css';

interface ChartGroup {
  title: string;
  /** Series code -> axis; the right axis is for the series on a different scale. */
  axes: Record<string, 0 | 1>;
}

const CHART_GROUPS: ChartGroup[] = [
  { title: '压力层', axes: { STLFSI4: 0, HY_OAS: 0, VIX: 1 } },
  { title: '意图层', axes: { CUT_PRICING: 0, FFTR_HIGH: 1 } },
  { title: '行动层', axes: { SOMA_LONG_13W: 0, NONSEC_ASSETS: 0, SOMA_TOTAL: 1 } },
];

function buildGroupSeries(group: ChartGroup, replay: QeReplay, catalog: Map<string, LiquidityCatalogEntry>): ChartSeries[] {
  return Object.entries(group.axes).flatMap(([code, axis]) => {
    const points = replay.series[code];
    if (!points || points.length === 0) return [];
    const entry = catalog.get(code);
    return [{ key: code, name: entry?.name ?? code, unit: entry?.unit ?? '', points, axis }];
  });
}

function StageStrip({ replay }: { replay: QeReplay }) {
  // Each stage runs until the next one starts, so the strip has no gaps between weekly evaluations.
  const end = addDays(replay.to, 1);
  const spans = replay.stages.map((s, i) => ({ ...s, until: replay.stages[i + 1]?.from ?? end }));
  const total = Math.max(1, Date.parse(end) - Date.parse(replay.from));
  if (spans.length === 0) return <div className={styles.muted}>窗口内没有阶梯数据</div>;

  return (
    <>
      <div className={styles.stageStrip} role="img" aria-label="回放窗口内的阶梯">
        {spans.map(s => {
          const width = ((Date.parse(s.until) - Math.max(Date.parse(s.from), Date.parse(replay.from))) / total) * 100;
          return (
            <div key={`${s.from}-${s.level}`} className={styles.stageStripPart}
                 style={{ width: `${Math.max(width, 0.3)}%`, background: stageCssColor(s.level) }}
                 title={`${s.from} ~ ${s.until}：L${s.level} ${stageInfo(s.level)?.name ?? ''}`} />
          );
        })}
      </div>
      <div className={styles.stageLegend}>
        {STAGE_INFO.map(s => (
          <span key={s.level}><i style={{ background: stageCssColor(s.level) }} />L{s.level} {s.name}</span>
        ))}
      </div>
    </>
  );
}

function ReplayCharts({ replay }: { replay: QeReplay }) {
  const catalog = useLiquidityCatalog().data;
  const byCode = useMemo(() => new Map((catalog ?? []).map(c => [c.code, c])), [catalog]);
  const events = useMemo<ChartEvent[]>(
    () => replay.episode.keyDates.map(d => ({ date: d, title: d })),
    [replay.episode.keyDates],
  );
  const groups = useMemo(
    () => CHART_GROUPS.map(g => ({ group: g, series: buildGroupSeries(g, replay, byCode) })),
    [replay, byCode],
  );

  return (
    <div className={styles.replayCharts}>
      {groups.map(({ group, series }) => (
        <section key={group.title} className={styles.panel}>
          <h3 className={styles.panelTitle}>{group.title}</h3>
          {series.length === 0
            ? <div className={styles.notice}>该窗口内没有这一层的数据（当年还没有对应指标）</div>
            : <TimeSeriesChart series={series} events={events} height={240} label={`${group.title}回放`} />}
        </section>
      ))}
    </div>
  );
}

function LeadsTable({ replay }: { replay: QeReplay }) {
  const leads = useMemo(() => sortLeads(replay.leads), [replay.leads]);
  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>提前量表</h3>
      <p className={styles.panelNote}>
        在第一个关键日期（{replay.episode.keyDates[0]}）之前的 180 天内，各指标第一次出现弱信号 / 强信号的日期，以及提前了多少天。
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>指标</th><th>首次弱信号</th><th className={styles.num}>提前</th>
            <th>首次强信号</th><th className={styles.num}>提前</th>
          </tr>
        </thead>
        <tbody>
          {leads.map(l => (
            <tr key={l.code}>
              <td>{l.name}<div className={styles.rowNote}>{l.code}</div></td>
              <td>{l.firstYellow ?? '—'}</td>
              <td className={styles.num}>{formatLeadDays(l.leadDaysYellow)}</td>
              <td>{l.firstRed ?? '—'}</td>
              <td className={styles.num}>{formatLeadDays(l.leadDaysRed)}</td>
            </tr>
          ))}
          {leads.length === 0 && <tr><td colSpan={5} className={styles.muted}>没有可对比的指标</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

export function ReplayPanel() {
  const episodes = useQeEpisodes();
  const [selected, setSelected] = useState<string | null>(null);
  const episodeId = selected ?? episodes.data?.[0]?.id ?? null;
  const replay = useQeReplay(episodeId);
  const current = episodes.data?.find(e => e.id === episodeId);

  if (episodes.isError) return <div className={styles.notice} data-tone="error">历史事件加载失败</div>;
  if (episodes.isLoading || !episodes.data) return <div className={styles.notice}>加载中…</div>;

  return (
    <div className={styles.overview}>
      <section className={styles.panel}>
        <div className={styles.btnRow}>
          <select className={styles.input} value={episodeId ?? ''} onChange={e => setSelected(e.target.value)} aria-label="历史事件">
            {episodes.data.map(e => <option key={e.id} value={e.id}>{e.name}（{e.type}）</option>)}
          </select>
          {current && <span className={styles.muted}>关键日期：{current.keyDates.join('、')}</span>}
        </div>
        {current && <p className={styles.panelNote}>{current.summary}</p>}
        {replay.isError ? <div className={styles.notice} data-tone="error">回放数据加载失败</div>
          : replay.isLoading || !replay.data ? <div className={styles.notice}>加载中…</div>
          : <StageStrip replay={replay.data} />}
      </section>

      {replay.data && (
        <>
          <ReplayCharts replay={replay.data} />
          <LeadsTable replay={replay.data} />
        </>
      )}
    </div>
  );
}
