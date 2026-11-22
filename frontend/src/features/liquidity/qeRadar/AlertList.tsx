import { getErrorMessage } from '../../../api';
import { useToast } from '../../../shared/ui/feedback/useFeedback';
import { useAckAllQeAlerts, useAckQeAlert, useQeAlerts } from '../liquidityQueries';
import { ALERT_TYPE_INFO } from './qeRadarUtils';
import styles from '../Liquidity.module.css';

export function AlertList() {
  const toast = useToast();
  const { data, isLoading, isError } = useQeAlerts();
  const ack = useAckQeAlert();
  const ackAll = useAckAllQeAlerts();

  if (isError) return <div className={styles.notice} data-tone="error">提醒加载失败</div>;
  if (isLoading || !data) return <div className={styles.notice}>加载中…</div>;

  const unread = data.filter(a => !a.acknowledged).length;
  const onError = (err: unknown) => toast.error(getErrorMessage(err, '操作失败，请重试。'));

  return (
    <section className={styles.panel}>
      <div className={styles.btnRow}>
        <span className={styles.muted}>阶段变化、升级可能性变化和联储文本命中会在同步后生成提醒（仅应用内）。</span>
        <button type="button" className="cancel-btn" disabled={unread === 0 || ackAll.isPending}
                onClick={() => ackAll.mutate(undefined, { onError })}>全部标为已读</button>
      </div>
      {data.length === 0 ? <div className={styles.notice}>暂无提醒</div> : (
        <ul className={styles.alertList}>
          {data.map(a => {
            const info = ALERT_TYPE_INFO[a.alertType];
            return (
              <li key={a.id} className={styles.alertItem} data-unread={!a.acknowledged}>
                <span className={styles.alertIcon} title={info?.label}>{info?.icon ?? '🔔'}</span>
                <div className={styles.alertBody}>
                  <div className={styles.alertTitle}>{a.title}</div>
                  {a.detail && <div className={styles.alertDetail}>{a.detail}</div>}
                  <div className={styles.muted}>{a.createdAt.replace('T', ' ').slice(0, 16)}</div>
                </div>
                {!a.acknowledged && (
                  <button type="button" className="cancel-btn" disabled={ack.isPending}
                          onClick={() => ack.mutate(a.id, { onError })}>已读</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
