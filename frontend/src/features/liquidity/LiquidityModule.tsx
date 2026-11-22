import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getErrorMessage, startLiquiditySync, SYNC_SOURCES, type SyncMode, type SyncSource } from '../../api';
import { ThemePicker } from '../../ThemePicker';
import { useToast } from '../../shared/ui/feedback/useFeedback';
import {
  LIQUIDITY_KEY, useLiquidityDashboard, useLiquiditySyncStatus,
} from './liquidityQueries';
import { OverviewTab } from './tabs/OverviewTab';
import { QeRadarTab } from './tabs/QeRadarTab';
import { ScatterTab } from './tabs/ScatterTab';
import { SettingsTab } from './tabs/SettingsTab';
import { TrendsTab } from './tabs/TrendsTab';
import { WeeklyTab } from './tabs/WeeklyTab';
import styles from './Liquidity.module.css';

type TabId = 'overview' | 'qe' | 'trends' | 'scatter' | 'weekly' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: '总览' },
  { id: 'qe', label: '放水雷达' },
  { id: 'trends', label: '趋势图' },
  { id: 'scatter', label: '准备金散点' },
  { id: 'weekly', label: '周报' },
  { id: 'settings', label: '设置' },
];

/** The "4 weeks of Fed bill purchases" card has no series of its own; its monthly totals are the closest chart. */
const CARD_TO_SERIES: Record<string, string> = { RMP_4W: 'RMP_MONTHLY' };

interface Props {
  onGoHome: () => void;
}

export default function LiquidityModule({ onGoHome }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>('overview');
  const [trendFocus, setTrendFocus] = useState<string[]>([]);

  const dashboard = useLiquidityDashboard();
  const syncStatus = useLiquiditySyncStatus();
  const running = syncStatus.data?.running ?? false;
  const progress = syncStatus.data?.current;
  const progressSuffix = progress ? ` · ${progress.source}${progress.steps > 0 ? ` ${progress.step}/${progress.steps}` : ''}` : '…';
  const wasRunning = useRef(false);
  const lastRunSize = useRef(SYNC_SOURCES.length);

  // When a sync finishes: reload every liquidity query and tell the user how it went.
  useEffect(() => {
    if (wasRunning.current && !running) {
      void queryClient.invalidateQueries({ queryKey: LIQUIDITY_KEY });
      const latestRun = (syncStatus.data?.lastLogs ?? []).slice(0, lastRunSize.current);
      lastRunSize.current = SYNC_SOURCES.length;
      const failed = latestRun.filter(l => l.status === 'FAILED');
      if (failed.length > 0) {
        const reason = failed[0].message ? `：${failed[0].message.slice(0, 80)}` : '';
        toast.error(`同步完成，但 ${failed.map(l => l.source).join('、')} 失败${reason}（详见设置页日志）`);
      } else toast.success('同步完成');
    }
    wasRunning.current = running;
  }, [running, syncStatus.data, queryClient, toast]);

  async function startSync(mode: SyncMode, source?: SyncSource) {
    try {
      await startLiquiditySync(mode, source);
      lastRunSize.current = source ? 1 : SYNC_SOURCES.length;
      const scope = source ? ` ${source}` : '';
      toast.info(mode === 'FULL' ? `已开始${scope}全量重建，可能需要数分钟` : `已开始${scope}增量同步`);
    } catch (err) {
      toast.error(getErrorMessage(err, '无法开始同步'));
    } finally {
      void queryClient.invalidateQueries({ queryKey: [...LIQUIDITY_KEY, 'sync-status'] });
    }
  }

  function openTrend(code: string) {
    setTrendFocus([CARD_TO_SERIES[code] ?? code]);
    setTab('trends');
  }

  function selectTab(id: TabId) {
    setTrendFocus([]);
    setTab(id);
  }

  return (
    <div className="app-container">
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome} title="返回主页">⌂</button>
          <h1 className="app-title">美元流动性监测</h1>
          <span className={styles.titleEn}>LIQUIDITY MONITOR</span>
        </div>
        <div className="header-right">
          <span className={styles.syncPill} data-running={running}>
            {running ? `⟳ 同步中${progressSuffix}` : dashboard.data?.asOf ? `数据截至 ${dashboard.data.asOf}` : ''}
          </span>
          <button className="icon-btn" title="刷新" onClick={() => void queryClient.invalidateQueries({ queryKey: LIQUIDITY_KEY })}>↻</button>
          <ThemePicker />
        </div>
      </header>

      <div className={styles.tabBar}>
        {TABS.map(t => (
          <button key={t.id} type="button" className={styles.tab} data-active={tab === t.id} onClick={() => selectTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {tab === 'overview' && (
          <OverviewTab dashboard={dashboard.data} loading={dashboard.isLoading}
                       error={dashboard.isError ? getErrorMessage(dashboard.error, '总览加载失败') : null}
                       onOpenTrend={openTrend} onOpenQe={() => selectTab('qe')} />
        )}
        {tab === 'qe' && <QeRadarTab onOpenTrend={openTrend} />}
        {tab === 'trends' && <TrendsTab key={trendFocus.join(',')} focusCodes={trendFocus} />}
        {tab === 'scatter' && <ScatterTab />}
        {tab === 'weekly' && <WeeklyTab />}
        {tab === 'settings' && <SettingsTab fredConfigured={dashboard.data?.fredConfigured ?? false} onStartSync={startSync} />}
      </div>
    </div>
  );
}
