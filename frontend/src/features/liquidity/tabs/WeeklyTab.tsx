import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  deleteLiquiditySnapshot, getErrorMessage, saveLiquiditySnapshot, updateLiquiditySnapshot, type LiquidityWeeklyReport,
} from '../../../api';
import { useConfirm, useToast } from '../../../shared/ui/feedback/useFeedback';
import { LIQUIDITY_KEY, useLiquiditySnapshot, useLiquiditySnapshots, useLiquidityWeekly } from '../liquidityQueries';
import {
  addDays, buildWeeklyMarkdown, downloadTextFile, formatChange, formatValue, STATUS_EMOJI, STATUS_LABEL, weeklyFileName,
} from '../liquidityUtils';
import styles from '../Liquidity.module.css';

function ReportView({ report }: { report: LiquidityWeeklyReport }) {
  return (
    <>
      <div className={styles.weekSummary} data-status={report.overallStatus}>
        综合状态：{STATUS_EMOJI[report.overallStatus]} {STATUS_LABEL[report.overallStatus]}
        <span className={styles.muted}> ｜ 数据截至 {report.dataAsOf ?? '—'}</span>
      </div>
      <table className={styles.table}>
        <thead>
          <tr><th>指标</th><th className={styles.num}>本周</th><th className={styles.num}>上周</th><th className={styles.num}>变化</th><th>状态</th></tr>
        </thead>
        <tbody>
          {report.rows.map(r => (
            <tr key={r.key}>
              <td title={r.basis}>
                {r.label}
                {r.note && <div className={styles.rowNote}>{r.note}</div>}
              </td>
              <td className={styles.num}>{formatValue(r.current, r.unit)}</td>
              <td className={styles.num}>{formatValue(r.previous, r.unit)}</td>
              <td className={styles.num}>{formatChange(r.change, r.unit)}</td>
              <td>{r.status === 'NONE' ? <span className={styles.muted}>—</span> : <span title={STATUS_LABEL[r.status]}>{STATUS_EMOJI[r.status]}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 className={styles.subTitle}>观察要点</h4>
      <ul className={styles.obsList}>
        {report.observations.map(o => <li key={o}>{o}</li>)}
      </ul>
    </>
  );
}

interface EditorProps {
  report: LiquidityWeeklyReport;
  initialCommentary: string;
  /** "live" saves a new / replacement snapshot; "snapshot" edits the commentary of a stored one. */
  mode: 'live' | 'snapshot';
  snapshotId?: number;
  onDeleted?: () => void;
}

/** Remounted (via key) whenever a different week or a freshly saved snapshot is shown, so the draft always starts clean. */
function CommentaryEditor({ report, initialCommentary, mode, snapshotId, onDeleted }: EditorProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [commentary, setCommentary] = useState(initialCommentary);
  const [saving, setSaving] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: [...LIQUIDITY_KEY, 'snapshots'] })
    .then(() => queryClient.invalidateQueries({ queryKey: [...LIQUIDITY_KEY, 'snapshot'] }));

  async function save() {
    setSaving(true);
    try {
      if (mode === 'live') await saveLiquiditySnapshot(report.weekEnd, commentary);
      else await updateLiquiditySnapshot(snapshotId as number, commentary);
      await refresh();
      toast.success(mode === 'live' ? '快照已保存' : '点评已保存');
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败，请重试。'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!await confirm({ message: '确定删除这份周报快照？', confirmText: '删除', danger: true })) return;
    try {
      await deleteLiquiditySnapshot(snapshotId as number);
      await refresh();
      onDeleted?.();
    } catch (err) {
      toast.error(getErrorMessage(err, '删除失败，请重试。'));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildWeeklyMarkdown(report, commentary));
      toast.success('Markdown 已复制到剪贴板');
    } catch {
      toast.error('复制失败，请改用「下载 .md」');
    }
  }

  return (
    <>
      <h4 className={styles.subTitle}>我的点评</h4>
      <textarea className={styles.commentary} rows={6} value={commentary} onChange={e => setCommentary(e.target.value)}
                placeholder="写下本周的判断与跟踪事项（支持 Markdown，导出周报时一并带出）" />
      <div className={styles.btnRow}>
        <button type="button" className="confirm-btn" onClick={save} disabled={saving}>
          {mode === 'live' ? '保存快照' : '保存点评'}
        </button>
        <button type="button" className="cancel-btn" onClick={copy}>复制 Markdown</button>
        <button type="button" className="cancel-btn"
                onClick={() => downloadTextFile(buildWeeklyMarkdown(report, commentary), weeklyFileName(report.weekEnd))}>
          下载 .md
        </button>
        {mode === 'snapshot' && <button type="button" className="cancel-btn" onClick={remove}>删除快照</button>}
      </div>
    </>
  );
}

export function WeeklyTab() {
  const [weekEnd, setWeekEnd] = useState<string | undefined>(undefined);
  const [viewingId, setViewingId] = useState<number | null>(null);

  const latest = useLiquidityWeekly(undefined);
  const live = useLiquidityWeekly(weekEnd);
  const snapshots = useLiquiditySnapshots();
  const report = live.data;

  const existing = report ? snapshots.data?.find(s => s.weekEnd === report.weekEnd) : undefined;
  const existingDetail = useLiquiditySnapshot(existing?.id ?? null);
  const viewed = useLiquiditySnapshot(viewingId);

  const latestWeekEnd = latest.data?.weekEnd;
  const canGoNext = !!report && !!latestWeekEnd && addDays(report.weekEnd, 7) <= latestWeekEnd;

  function goToWeek(delta: number) {
    if (report) setWeekEnd(addDays(report.weekEnd, delta));
    setViewingId(null);
  }

  return (
    <div className={styles.weekly}>
      <div className={styles.weeklyMain}>
        {viewingId != null ? (
          <>
            <div className={styles.weekNav}>
              <button type="button" className="cancel-btn" onClick={() => setViewingId(null)}>← 返回当前周</button>
              <strong>快照 {viewed.data?.weekEnd ?? ''}（只读数据，点评可编辑）</strong>
            </div>
            {viewed.isError ? <div className={styles.notice} data-tone="error">快照加载失败</div>
              : !viewed.data ? <div className={styles.notice}>加载中…</div>
              : (
                <>
                  <h3 className={styles.panelTitle}>美元环流周报 {viewed.data.report.weekStart} ~ {viewed.data.report.weekEnd}</h3>
                  <ReportView report={viewed.data.report} />
                  <CommentaryEditor key={`${viewed.data.id}:${viewed.data.updatedAt}`} report={viewed.data.report}
                                    initialCommentary={viewed.data.commentary ?? ''} mode="snapshot"
                                    snapshotId={viewed.data.id} onDeleted={() => setViewingId(null)} />
                </>
              )}
          </>
        ) : (
          <>
            <div className={styles.weekNav}>
              <button type="button" className="cancel-btn" onClick={() => goToWeek(-7)} disabled={!report}>← 上一周</button>
              <strong>{report ? `${report.weekStart} ~ ${report.weekEnd}` : '加载中…'}</strong>
              <button type="button" className="cancel-btn" onClick={() => goToWeek(7)} disabled={!canGoNext}>下一周 →</button>
              {existing && <span className={styles.muted}>已有快照（保存会覆盖）</span>}
            </div>
            {live.isError ? <div className={styles.notice} data-tone="error">周报加载失败</div>
              : !report || (existing && existingDetail.isLoading) ? <div className={styles.notice}>加载中…</div>
              : (
                <>
                  <h3 className={styles.panelTitle}>美元环流周报（实时计算）</h3>
                  <ReportView report={report} />
                  <CommentaryEditor key={`${report.weekEnd}:${existingDetail.data?.updatedAt ?? 'new'}`} report={report}
                                    initialCommentary={existingDetail.data?.commentary ?? ''} mode="live" />
                </>
              )}
          </>
        )}
      </div>

      <aside className={styles.weeklySide}>
        <h4 className={styles.subTitle}>已保存快照</h4>
        {snapshots.data && snapshots.data.length === 0 && <div className={styles.muted}>暂无快照</div>}
        <ul className={styles.snapshotList}>
          {snapshots.data?.map(s => (
            <li key={s.id}>
              <button type="button" className={styles.snapshotItem} data-active={viewingId === s.id} onClick={() => setViewingId(s.id)}>
                <span>{s.weekEnd}</span>
                <span className={styles.muted}>{s.hasCommentary ? '有点评' : '无点评'}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
