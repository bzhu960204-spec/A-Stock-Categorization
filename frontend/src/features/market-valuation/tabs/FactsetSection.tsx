import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getErrorMessage, retryMvFactsetReport } from '../../../api';
import { useToast } from '../../../shared/ui/feedback/useFeedback';
import { MV_KEY, MV_SYNC_STATUS_KEY, useMvFactsetReports, useMvSyncStatus } from '../mvQueries';
import styles from '../MarketValuation.module.css';

const STATUS_TEXT = { PARSED: '已解析', PARSE_FAILED: '解析失败', NOT_FOUND: '未找到' } as const;

export function FactsetSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useMvFactsetReports();
  const running = useMvSyncStatus().data?.running ?? false;
  const [retrying, setRetrying] = useState<string | null>(null);

  async function retry(weekFriday: string) {
    setRetrying(weekFriday);
    try {
      await retryMvFactsetReport(weekFriday);
      toast.info(`已开始重试 ${weekFriday} 这一周的 FactSet 报告`);
    } catch (err) {
      toast.error(getErrorMessage(err, '无法开始重试'));
    } finally {
      setRetrying(null);
      void queryClient.invalidateQueries({ queryKey: MV_SYNC_STATUS_KEY });
      void queryClient.invalidateQueries({ queryKey: [...MV_KEY, 'factset-reports'] });
    }
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>FactSet 周报簿记</h3>
      <p className={styles.panelNote}>
        FactSet Earnings Insight 每周五发布，历史会随同步分批补齐（每次最多处理一批）。
        {data && `已处理 ${data.processedWeeks} / 共 ${data.totalWeeks} 周。`}
      </p>
      <table className={styles.table}>
        <thead>
          <tr><th>周五</th><th>文件</th><th>状态</th><th>季度</th><th>信息</th><th /></tr>
        </thead>
        <tbody>
          {(data?.reports ?? []).map(r => (
            <tr key={r.weekFriday}>
              <td>{r.weekFriday}</td>
              <td className={styles.rowNote}>{r.fileName ?? '—'}</td>
              <td data-log-status={r.status === 'PARSED' ? 'SUCCESS' : r.status === 'PARSE_FAILED' ? 'FAILED' : 'SKIPPED'}>{STATUS_TEXT[r.status]}</td>
              <td>{r.fiscalQuarter ?? '—'}</td>
              <td className={styles.logMessage} title={r.message ?? undefined}>{r.message ?? ''}</td>
              <td className={styles.rowActions}>
                {r.status !== 'PARSED' && (
                  <button type="button" className="cancel-btn" disabled={running || retrying != null} onClick={() => retry(r.weekFriday)}>
                    {retrying === r.weekFriday ? '重试中…' : '重试'}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {data && data.reports.length === 0 && <tr><td colSpan={6} className={styles.muted}>暂无簿记（FactSet 尚未同步）</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
