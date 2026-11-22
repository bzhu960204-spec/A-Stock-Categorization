import type { MvMissing } from '../../api';
import { Sparkline } from '../liquidity/Sparkline';
import { formatMvChange, formatMvValue, formatPercentile, percentileTone, TONE_COLOR } from './mvUtils';
import styles from './MarketValuation.module.css';

/** What a card shows; valuation cards and profitability items are both mapped onto it. */
export interface CardModel {
  code: string;
  name: string;
  unit: string;
  value: number | null;
  date: string | null;
  change: number | null;
  /** Direction-adjusted historical percentile; null for indicators that are not coloured (profitability). */
  percentile: number | null;
  spark: [string, number][];
  stale: boolean;
  estimate: boolean;
  missing: MvMissing;
  signed: boolean;
  /** E.g. the fiscal quarter a FactSet growth rate refers to. */
  tag?: string | null;
}

interface Props {
  card: CardModel;
  /** True while the first backfill is running (the observation table is still empty). */
  initializing: boolean;
  onOpen: (code: string) => void;
}

export function ValuationCard({ card, initializing, onOpen }: Props) {
  const tone = percentileTone(card.percentile);
  const arrow = card.change == null || card.change === 0 ? '' : card.change > 0 ? '▲' : '▼';

  const placeholder = card.missing === 'NO_FRED_KEY' ? '需要 FRED API Key → 去首页 ⚙ 设置'
    : initializing ? '正在初始化历史数据…'
    : card.value == null ? '暂无数据'
    : null;

  return (
    <button type="button" className={styles.card} data-tone={tone} onClick={() => onOpen(card.code)}
            title={`${card.name} — 点击查看趋势图`}>
      <div className={styles.cardHead}>
        <span className={styles.cardName}>{card.name}</span>
        <span className={styles.badges}>
          {card.tag && <span className={styles.badge}>{card.tag}</span>}
          {card.estimate && placeholder == null && <span className={styles.badge} data-kind="estimate" title="按最新价格外推的日度估算">估算</span>}
        </span>
      </div>
      {placeholder != null ? (
        <div className={styles.cardPlaceholder}>{placeholder}</div>
      ) : (
        <>
          <div className={styles.cardValue}>{formatMvValue(card.value, card.unit, card.signed)}</div>
          <div className={styles.cardMeta}>
            <span className={styles.cardChange}>
              {arrow} {formatMvChange(card.change, card.unit)} <span className={styles.muted}>较 1 个月前</span>
            </span>
            <span className={styles.cardDate} data-stale={card.stale} title={card.stale ? '数据滞后' : undefined}>{card.date}</span>
          </div>
          <div className={styles.cardFoot}>
            <span className={styles.cardPercentile} data-tone={tone}>
              {card.percentile == null ? '' : `分位 ${formatPercentile(card.percentile)}`}
            </span>
            <div className={styles.spark}>
              <Sparkline points={card.spark.map(([date, value]) => ({ date, value }))} color={TONE_COLOR[tone]} />
            </div>
          </div>
        </>
      )}
    </button>
  );
}
