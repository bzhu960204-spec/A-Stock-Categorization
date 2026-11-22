import type { LiquidityCard, LiquidityStatus } from '../../api';
import { Sparkline } from './Sparkline';
import { formatChange, formatValue, STATUS_LABEL } from './liquidityUtils';
import styles from './Liquidity.module.css';

interface Props {
  card: LiquidityCard;
  /** Opens the trend tab with this indicator preselected. */
  onOpen: (code: string) => void;
  /** Overrides the status wording (the radar says 无信号 / 弱信号 / 强信号 instead of 绿 / 黄 / 红). */
  statusLabels?: Record<LiquidityStatus, string>;
  /** Tooltip text; defaults to the card name. */
  description?: string | null;
}

const SPARK_COLOR: Record<LiquidityStatus, string> = {
  RED: 'var(--danger)',
  YELLOW: 'var(--liq-yellow)',
  GREEN: 'var(--accent-3)',
  NONE: 'var(--text-muted)',
};

export function IndicatorCard({ card, onOpen, statusLabels = STATUS_LABEL, description }: Props) {
  const { latest, change, status } = card;
  const direction = change == null || change === 0 ? '' : change > 0 ? '▲' : '▼';
  const tooltip = description ? `${card.name}：${description}` : card.name;

  return (
    <button type="button" className={styles.card} data-status={status} onClick={() => onOpen(card.code)}
            title={`${tooltip} — 点击查看趋势图`}>
      <div className={styles.cardHead}>
        <span className={styles.cardName}>{card.name}</span>
        <span className={styles.statusDot} data-status={status} title={statusLabels[status]} />
      </div>

      {card.needsFredKey ? (
        <div className={styles.cardPlaceholder}>需要 FRED API Key → 去首页 ⚙ 设置</div>
      ) : latest ? (
        <>
          <div className={styles.cardValue}>{formatValue(latest.value, card.unit)}</div>
          <div className={styles.cardMeta}>
            <span className={styles.cardChange} data-dir={direction}>
              {direction} {formatChange(change, card.unit)} <span className={styles.muted}>较上周</span>
            </span>
            <span className={styles.muted}>{latest.date}</span>
          </div>
          <div className={styles.spark}>
            <Sparkline points={card.spark} color={SPARK_COLOR[status]} />
          </div>
        </>
      ) : (
        <div className={styles.cardPlaceholder}>暂无数据</div>
      )}
    </button>
  );
}
