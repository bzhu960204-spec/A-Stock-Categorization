import type { MvCard, MvDashboard, MvProfitItem, MvProfitability } from '../../../api';
import { TemperatureBar } from '../TemperatureBar';
import { ValuationCard, type CardModel } from '../ValuationCard';
import {
  formatMvValue, formatPercentile, isMvSourceStale, isSignedCode, percentileTone, sourceName, windowLabel, windowStart,
} from '../mvUtils';
import { todayIso } from '../../liquidity/liquidityUtils';
import styles from '../MarketValuation.module.css';

interface Props {
  dashboard: MvDashboard | undefined;
  loading: boolean;
  error: string | null;
  onOpen: (code: string) => void;
}

const CARD_GROUPS: { group: MvCard['group']; title: string }[] = [
  { group: 'ABSOLUTE', title: '绝对估值 · 出价贵不贵' },
  { group: 'RELATIVE', title: '相对估值 · 相对债券值不值' },
];
const PROFIT_ORDER: (keyof MvProfitability)[] = [
  'epsYoy', 'fsEpsGrowthQ', 'fsEpsGrowthNextYear', 'fsFwdEpsChg13w', 'netMargin', 'profitGdp',
];
const SOURCE_STATUS_TEXT: Record<string, string> = { SUCCESS: '正常', PARTIAL: '部分失败', FAILED: '失败', SKIPPED: '已跳过', RUNNING: '同步中' };

const fromCard = (c: MvCard): CardModel => ({
  code: c.code, name: c.name, unit: c.unit, value: c.value, date: c.date, change: c.change, percentile: c.percentile,
  spark: c.spark, stale: c.stale, estimate: c.estimate, missing: c.missing, signed: isSignedCode(c.code),
});

const fromProfit = (p: MvProfitItem): CardModel => ({
  code: p.code, name: p.name, unit: p.unit, value: p.value, date: p.date, change: p.change, percentile: null,
  spark: [], stale: p.stale, estimate: false, missing: p.missing, signed: isSignedCode(p.code), tag: p.quarter,
});

export function OverviewTab({ dashboard, loading, error, onOpen }: Props) {
  if (error) return <div className={styles.notice} data-tone="error">{error}</div>;
  if (loading || !dashboard) return <div className={styles.notice}>加载中…</div>;

  const today = todayIso();
  const initializing = !dashboard.hasData;
  const { temperature, quadrant } = dashboard;
  const unitOf = new Map(dashboard.cards.map(c => [c.code, c.unit]));
  const windowFrom = dashboard.asOf ? windowStart(dashboard.window, dashboard.asOf) : null;

  return (
    <div className={styles.overview}>
      <div className={styles.banner} data-tone={percentileTone(temperature.value)}>
        <TemperatureBar value={temperature.value} level={temperature.level} windowText={windowLabel(dashboard.window)} />
        {quadrant && <div className={styles.bannerTitle}>{quadrant.text}</div>}
        <div className={styles.bannerSub}>
          数据截至 {dashboard.asOf ?? '—'}
          {windowFrom && ` · 分位窗口 ${windowFrom} ~ ${dashboard.asOf}`}
        </div>
        <div className={styles.sources}>
          {dashboard.sources.map(s => (
            <span key={s.source} className={styles.source} data-stale={isMvSourceStale(s, today)}
                  title={s.lastSuccessAt ? `最近成功同步：${s.lastSuccessAt.replace('T', ' ').slice(0, 16)}` : '尚未成功同步'}>
              {sourceName(s.source)}：{s.latestObsDate ?? '无数据'}
              {s.lastStatus && s.lastStatus !== 'SUCCESS' ? `（${SOURCE_STATUS_TEXT[s.lastStatus] ?? s.lastStatus}）` : ''}
            </span>
          ))}
        </div>
      </div>

      {initializing && (
        <div className={styles.notice}>正在初始化历史数据（价格与 multpl 约 1–2 分钟；FactSet 历史会在后台逐步补齐），完成后会自动刷新…</div>
      )}
      {!dashboard.fredConfigured && (
        <div className={styles.notice} data-tone="warn">
          未配置 FRED API Key：巴菲特指标、实际 ERP、利润 / GDP 等指标暂不可用。请到首页 ⚙ 设置中填写。
        </div>
      )}

      <section>
        <h3 className={styles.rowTitle}>估值温度分量</h3>
        <table className={styles.table}>
          <thead>
            <tr><th>分量</th><th className={styles.num}>当前值</th><th>历史分位（越贵越高）</th><th>样本起点</th></tr>
          </thead>
          <tbody>
            {temperature.components.map(c => {
              const tone = c.excluded ? 'none' : percentileTone(c.percentile);
              return (
                <tr key={c.key}>
                  <td>{c.name}</td>
                  <td className={styles.num}>{formatMvValue(c.value, unitOf.get(c.code) ?? '', c.key === 'ERP')}</td>
                  <td>
                    {c.excluded ? (
                      <span className={styles.badge} data-kind="warn" title={c.excludedReason ?? undefined}>样本不足</span>
                    ) : (
                      <div className={styles.pctCell}>
                        <div className={styles.pctTrack}>
                          <div className={styles.pctFill} data-tone={tone} style={{ width: `${Math.min(100, Math.max(0, c.percentile ?? 0))}%` }} />
                        </div>
                        <span className={styles.pctText} data-tone={tone}>{formatPercentile(c.percentile)}</span>
                      </div>
                    )}
                  </td>
                  <td className={styles.rowNote}>{c.sampleStart ? `${c.sampleStart}（n=${c.n}）` : '—'}</td>
                </tr>
              );
            })}
            {temperature.components.length === 0 && <tr><td colSpan={4} className={styles.muted}>暂无分量数据</td></tr>}
          </tbody>
        </table>
      </section>

      {CARD_GROUPS.map(({ group, title }) => (
        <CardSection key={group} title={title} cards={dashboard.cards.filter(c => c.group === group).map(fromCard)}
                     initializing={initializing} onOpen={onOpen} />
      ))}
      <CardSection title="盈利能力 · 资产赚不赚钱"
                   cards={PROFIT_ORDER.map(key => fromProfit(dashboard.profitability[key]))}
                   initializing={initializing} onOpen={onOpen} />
      <CardSection title="结构与情绪" cards={dashboard.cards.filter(c => c.group === 'STRUCTURE').map(fromCard)}
                   initializing={initializing} onOpen={onOpen} />
    </div>
  );
}

function CardSection({ title, cards, initializing, onOpen }: {
  title: string; cards: CardModel[]; initializing: boolean; onOpen: (code: string) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <section>
      <h3 className={styles.rowTitle}>{title}</h3>
      <div className={styles.cardGrid}>
        {cards.map(card => <ValuationCard key={card.code} card={card} initializing={initializing} onOpen={onOpen} />)}
      </div>
    </section>
  );
}
