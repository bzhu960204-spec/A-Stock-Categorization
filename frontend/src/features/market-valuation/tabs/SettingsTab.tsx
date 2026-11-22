import { useState } from 'react';
import { MV_SYNC_SOURCES, type MvSyncSource, type SyncMode } from '../../../api';
import { useConfirm } from '../../../shared/ui/feedback/useFeedback';
import { describeProgress, elapsedText } from '../../liquidity/liquidityUtils';
import { useMvSyncStatus } from '../mvQueries';
import { isOrphanedMvRun, sourceName } from '../mvUtils';
import { FactsetSection } from './FactsetSection';
import { ManualSection } from './ManualSection';
import styles from '../MarketValuation.module.css';

interface Props {
  fredConfigured: boolean;
  onStartSync: (mode: SyncMode, source?: MvSyncSource) => void;
}

const STATUS_TEXT = { RUNNING: '运行中', SUCCESS: '成功', PARTIAL: '部分成功', FAILED: '失败', SKIPPED: '已跳过' } as const;

function SyncSection({ onStartSync }: { onStartSync: Props['onStartSync'] }) {
  const confirm = useConfirm();
  const { data } = useMvSyncStatus();
  const running = data?.running ?? false;
  const current = data?.current ?? null;
  const [source, setSource] = useState<MvSyncSource | ''>('');
  const target = source || undefined;

  async function fullRebuild() {
    const ok = await confirm({
      message: `全量重建会重新拉取${source ? ` ${source} ` : ''}全部历史数据（价格自 1990 年起，multpl 自 1871 年起；FactSet 历史会分批补齐），可能需要数分钟。继续吗？`,
      confirmText: '开始重建',
    });
    if (ok) onStartSync('FULL', target);
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>数据同步</h3>
      <div className={styles.btnRow}>
        <select className={styles.input} value={source} onChange={e => setSource(e.target.value as MvSyncSource | '')}
                disabled={running} aria-label="同步数据源">
          <option value="">全部数据源</option>
          {MV_SYNC_SOURCES.map(s => <option key={s} value={s}>{s}（{sourceName(s)}）</option>)}
        </select>
        <button type="button" className="confirm-btn" onClick={() => onStartSync('INCREMENTAL', target)} disabled={running}>增量同步</button>
        <button type="button" className="cancel-btn" onClick={fullRebuild} disabled={running}>全量重建历史</button>
        <span className={styles.muted} role="status">
          {running
            ? `同步进行中：${current ? `${describeProgress(current)}（已运行 ${elapsedText(current.startedAt, null)}）` : '准备中…'}`
            : '空闲（每天自动增量同步一次，打开本页时超过 6 小时未更新也会自动刷新）'}
        </span>
      </div>
      <table className={styles.table}>
        <thead>
          <tr><th>数据源</th><th>模式</th><th>区间</th><th>状态</th><th className={styles.num}>行数</th><th>耗时</th><th>信息</th></tr>
        </thead>
        <tbody>
          {(data?.lastLogs ?? []).slice(0, 20).map(l => {
            const orphaned = isOrphanedMvRun(l, running);
            const message = orphaned ? '同步已中断（应用重启或异常退出），未完成' : l.message;
            return (
              <tr key={l.id}>
                <td>{l.source}</td>
                <td>{l.mode === 'FULL' ? '全量' : '增量'}</td>
                <td>{l.rangeFrom ?? '—'} ~ {l.rangeTo ?? '—'}</td>
                <td data-log-status={orphaned ? 'INTERRUPTED' : l.status}>{orphaned ? '已中断' : STATUS_TEXT[l.status]}</td>
                <td className={styles.num}>{l.rowsUpserted}</td>
                <td>{orphaned ? '—' : elapsedText(l.startedAt, l.finishedAt)}</td>
                <td className={styles.logMessage} title={message ?? undefined}>{message ?? ''}</td>
              </tr>
            );
          })}
          {data && data.lastLogs.length === 0 && <tr><td colSpan={7} className={styles.muted}>暂无同步记录</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

export function SettingsTab({ fredConfigured, onStartSync }: Props) {
  return (
    <div className={styles.settings}>
      {!fredConfigured && (
        <div className={styles.notice} data-tone="warn">
          未配置 FRED API Key：FRED 数据源会被跳过，巴菲特指标、实际 ERP、托宾 Q、利润 / GDP 将不可用。请到首页 ⚙ 设置中填写。
        </div>
      )}
      <SyncSection onStartSync={onStartSync} />
      <FactsetSection />
      <ManualSection />
    </div>
  );
}
