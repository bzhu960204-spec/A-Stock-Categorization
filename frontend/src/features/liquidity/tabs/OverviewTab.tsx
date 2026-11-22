import type { LiquidityDashboard, LiquiditySourceStatus } from '../../../api';
import { IndicatorCard } from '../IndicatorCard';
import { buildHeadline, isSourceStale, todayIso } from '../liquidityUtils';
import { useQeRadar } from '../liquidityQueries';
import { buildRadarSummary } from '../qeRadar/qeRadarUtils';
import styles from '../Liquidity.module.css';

interface Props {
  dashboard: LiquidityDashboard | undefined;
  loading: boolean;
  error: string | null;
  onOpenTrend: (code: string) => void;
  onOpenQe: () => void;
}

const ROW_TITLES: Record<number, string> = { 1: '价格 · 利差（bp）', 2: '数量 · 准备金与缓冲垫', 3: '联储工具 · 信用' };
const SOURCE_NAMES: Record<LiquiditySourceStatus['source'], string> = {
  NYFED: '纽约联储', TREASURY: '财政部', FRED: 'FRED', FEDTEXT: '联储文本',
};
const SOURCE_STATUS_TEXT: Record<string, string> = { SUCCESS: '正常', FAILED: '失败', SKIPPED: '已跳过', RUNNING: '同步中' };

export function OverviewTab({ dashboard, loading, error, onOpenTrend, onOpenQe }: Props) {
  const radar = useQeRadar();
  if (error) return <div className={styles.notice} data-tone="error">{error}</div>;
  if (loading || !dashboard) return <div className={styles.notice}>加载中…</div>;

  const today = todayIso();
  const initializing = dashboard.syncRunning && dashboard.observationCount === 0;
  const rows = [1, 2, 3].map(row => ({ row, cards: dashboard.cards.filter(c => c.row === row) }));

  return (
    <div className={styles.overview}>
      <div className={styles.banner} data-status={dashboard.overallStatus}>
        <div className={styles.bannerTitle}>{buildHeadline(dashboard)}</div>
        <div className={styles.bannerSub}>数据截至 {dashboard.asOf ?? '—'}</div>
        <div className={styles.sources}>
          {dashboard.sources.map(s => {
            const stale = isSourceStale(s, today);
            return (
              <span key={s.source} className={styles.source} data-stale={stale}
                    title={s.lastSuccessAt ? `最近成功同步：${s.lastSuccessAt.replace('T', ' ').slice(0, 16)}` : '尚未成功同步'}>
                {SOURCE_NAMES[s.source]}：{s.latestObsDate ?? '无数据'}
                {s.lastStatus && s.lastStatus !== 'SUCCESS' ? `（${SOURCE_STATUS_TEXT[s.lastStatus] ?? s.lastStatus}）` : ''}
              </span>
            );
          })}
        </div>
      </div>

      {radar.data && (
        <button type="button" className={styles.radarSummary} data-level={radar.data.stage.level} onClick={onOpenQe}>
          {buildRadarSummary(radar.data)}
        </button>
      )}

      {initializing && <div className={styles.notice}>正在初始化历史数据（约 1–3 分钟），完成后会自动刷新…</div>}
      {!dashboard.fredConfigured && (
        <div className={styles.notice} data-tone="warn">
          未配置 FRED API Key：IORB、准备金、银行总资产等指标暂不可用。请到首页 ⚙ 设置中填写。
        </div>
      )}

      {rows.map(({ row, cards }) => cards.length > 0 && (
        <section key={row}>
          <h3 className={styles.rowTitle}>{ROW_TITLES[row]}</h3>
          <div className={styles.cardGrid}>
            {cards.map(card => <IndicatorCard key={card.code} card={card} onOpen={onOpenTrend} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
