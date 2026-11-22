import { useMemo, useState } from 'react';
import { getErrorMessage, type LiquidityCard, type QeRadarView } from '../../../api';
import { IndicatorCard } from '../IndicatorCard';
import { useLiquidityCatalog, useQeRadar } from '../liquidityQueries';
import { AlertList } from '../qeRadar/AlertList';
import { NetLiquidityChart } from '../qeRadar/NetLiquidityChart';
import { LIKELIHOOD_LABEL, RADAR_STATUS_LABEL } from '../qeRadar/qeRadarUtils';
import { ReplayPanel } from '../qeRadar/ReplayPanel';
import { StageHistoryChart } from '../qeRadar/StageHistoryChart';
import { StageLadder } from '../qeRadar/StageLadder';
import { TextList } from '../qeRadar/TextList';
import styles from '../Liquidity.module.css';

type RadarView = 'radar' | 'replay' | 'texts' | 'alerts';

interface Props {
  onOpenTrend: (code: string) => void;
}

const LAYERS: { key: keyof QeRadarView['layers']; title: string; question: string }[] = [
  { key: 'pressure', title: '压力层', question: '有没有逼美联储出手的理由？领先几周到几个月' },
  { key: 'intent', title: '意图层', question: '美联储和市场是不是准备宽松了？领先几天到几周' },
  { key: 'action', title: '行动层', question: '是不是已经在加水？同步到滞后一周' },
];

/** The text-signal card has no series to chart, so it opens the text list instead. */
const TEXT_SIGNAL = 'TEXT_SIGNAL';

function LikelihoodSection({ view }: { view: QeRadarView }) {
  const { likelihood, nextSteps } = view;
  return (
    <section className={styles.panel}>
      <div className={styles.likelihoodHead}>
        <h3 className={styles.panelTitle}>升级可能性</h3>
        <span className={styles.likelihoodPill} data-level={likelihood.level}>{LIKELIHOOD_LABEL[likelihood.level]}</span>
      </div>
      <p className={styles.panelNote}>由压力层和意图层的最新读数估算，不预测具体哪一天宣布。</p>
      {likelihood.reasons.length > 0 && (
        <ul className={styles.obsList}>
          {likelihood.reasons.map(r => <li key={r}>{r}</li>)}
        </ul>
      )}
      {nextSteps.length > 0 && (
        <>
          <div className={styles.subTitle}>最可能的下一步</div>
          <ul className={styles.obsList}>
            {nextSteps.map(s => <li key={s}>{s}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}

function RadarContent({ view, onOpenTrend, onOpenTexts }: {
  view: QeRadarView; onOpenTrend: (code: string) => void; onOpenTexts: () => void;
}) {
  const catalog = useLiquidityCatalog().data;
  const descriptions = useMemo(() => new Map((catalog ?? []).map(c => [c.code, c.description])), [catalog]);
  const open = (code: string) => (code === TEXT_SIGNAL ? onOpenTexts() : onOpenTrend(code));
  const renderCard = (card: LiquidityCard) => (
    <IndicatorCard key={card.code} card={card} onOpen={open} statusLabels={RADAR_STATUS_LABEL}
                   description={descriptions.get(card.code)} />
  );

  return (
    <div className={styles.overview}>
      {!view.fredConfigured && (
        <div className={styles.notice} data-tone="warn">
          未配置 FRED API Key：压力层和意图层的大部分指标暂不可用，升级可能性只按有数据的指标估算。阶梯判定仍可使用。请到首页 ⚙ 设置中填写。
        </div>
      )}
      <StageLadder stage={view.stage} />
      <LikelihoodSection view={view} />
      {LAYERS.map(({ key, title, question }) => view.layers[key].length > 0 && (
        <section key={key}>
          <h3 className={styles.rowTitle}>{title} · {question}</h3>
          <div className={styles.cardGrid}>{view.layers[key].map(renderCard)}</div>
        </section>
      ))}
      <StageHistoryChart />
      <NetLiquidityChart />
    </div>
  );
}

export function QeRadarTab({ onOpenTrend }: Props) {
  const [view, setView] = useState<RadarView>('radar');
  const radar = useQeRadar();
  const unread = radar.data?.unreadAlerts ?? 0;

  const views: { id: RadarView; label: string }[] = [
    { id: 'radar', label: '雷达' },
    { id: 'replay', label: '历史回放' },
    { id: 'texts', label: '联储文本' },
    { id: 'alerts', label: unread > 0 ? `提醒（${unread}）` : '提醒' },
  ];

  return (
    <div className={styles.overview}>
      <div className={styles.segmented} role="tablist">
        {views.map(v => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={styles.chip}
                  data-active={view === v.id} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'radar' && (
        radar.isError ? <div className={styles.notice} data-tone="error">{getErrorMessage(radar.error, '放水雷达加载失败')}</div>
          : radar.isLoading || !radar.data ? <div className={styles.notice}>加载中…</div>
          : <RadarContent view={radar.data} onOpenTrend={onOpenTrend} onOpenTexts={() => setView('texts')} />
      )}
      {view === 'replay' && <ReplayPanel />}
      {view === 'texts' && <TextList />}
      {view === 'alerts' && <AlertList />}
    </div>
  );
}
