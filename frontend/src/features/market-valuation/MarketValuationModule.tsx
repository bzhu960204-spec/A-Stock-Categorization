import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getErrorMessage, MV_SYNC_SOURCES, refreshMvIfStale, startMvSync, type MvSyncSource, type MvWindow, type SyncMode,
} from '../../api';
import { ThemePicker } from '../../ThemePicker';
import { useToast } from '../../shared/ui/feedback/useFeedback';
import { downloadTextFile, todayIso } from '../liquidity/liquidityUtils';
import {
  MV_KEY, MV_SYNC_STATUS_KEY, mvCatalogOptions, mvDashboardOptions, mvDecompositionOptions, mvMarketsOptions,
  useMvDashboard, useMvSyncStatus,
} from './mvQueries';
import { aiSummaryFileName, buildAiSummary, loadStoredWindow, MV_WINDOWS, storeWindow } from './mvUtils';
import { MarketsTab } from './tabs/MarketsTab';
import { OverviewTab } from './tabs/OverviewTab';
import { ProfitabilityTab } from './tabs/ProfitabilityTab';
import { SettingsTab } from './tabs/SettingsTab';
import { ValuationTab } from './tabs/ValuationTab';
import styles from './MarketValuation.module.css';

type TabId = 'overview' | 'valuation' | 'markets' | 'profitability' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: '总览' },
  { id: 'valuation', label: '估值趋势' },
  { id: 'markets', label: '多市场对比' },
  { id: 'profitability', label: '盈利能力' },
  { id: 'settings', label: '设置' },
];

/** Overview cards that belong to the profitability tab; every other card opens the valuation trends. */
const PROFITABILITY_CODES = new Set([
  'SPX_EPS_YOY', 'FS_EPS_G_Q', 'FS_EPS_G_NY', 'FS_FWD_EPS_CHG_13W', 'SPX_NET_MARGIN', 'SPX_ROE', 'PROFIT_GDP',
]);

interface Props {
  onGoHome: () => void;
}

export default function MarketValuationModule({ onGoHome }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>('overview');
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const [window, setWindow] = useState<MvWindow>(loadStoredWindow);
  const [copying, setCopying] = useState(false);

  const dashboard = useMvDashboard(window);
  const syncStatus = useMvSyncStatus();
  const running = syncStatus.data?.running ?? false;
  const progress = syncStatus.data?.current;
  const progressSuffix = progress ? ` · ${progress.source}${progress.steps > 0 ? ` ${progress.step}/${progress.steps}` : ''}` : '…';
  const wasRunning = useRef(false);
  const lastRunSize = useRef(MV_SYNC_SOURCES.length);
  const refreshAsked = useRef(false);

  // Opening the module refreshes data that is more than a few hours old; the backend decides ("stale") and starts the sync.
  useEffect(() => {
    if (refreshAsked.current) return;
    refreshAsked.current = true;
    refreshMvIfStale()
      .then(res => {
        if (!res.data.triggered) return;
        toast.info('数据已超过 6 小时未更新，正在后台刷新…');
        void queryClient.invalidateQueries({ queryKey: MV_SYNC_STATUS_KEY });
      })
      .catch(() => { /* a failed freshness check just means no automatic refresh */ });
  }, [queryClient, toast]);

  // When a sync finishes: reload every market-valuation query and tell the user how it went.
  useEffect(() => {
    if (wasRunning.current && !running) {
      void queryClient.invalidateQueries({ queryKey: MV_KEY });
      const latestRun = (syncStatus.data?.lastLogs ?? []).slice(0, lastRunSize.current);
      lastRunSize.current = MV_SYNC_SOURCES.length;
      const failed = latestRun.filter(l => l.status === 'FAILED');
      if (failed.length > 0) {
        const reason = failed[0].message ? `：${failed[0].message.slice(0, 80)}` : '';
        toast.error(`同步完成，但 ${failed.map(l => l.source).join('、')} 失败${reason}（详见设置页日志）`);
      } else toast.success('同步完成');
    }
    wasRunning.current = running;
  }, [running, syncStatus.data, queryClient, toast]);

  async function startSync(mode: SyncMode, source?: MvSyncSource) {
    try {
      await startMvSync(mode, source);
      lastRunSize.current = source ? 1 : MV_SYNC_SOURCES.length;
      const scope = source ? ` ${source}` : '';
      toast.info(mode === 'FULL' ? `已开始${scope}全量重建，可能需要数分钟` : `已开始${scope}增量同步`);
    } catch (err) {
      toast.error(getErrorMessage(err, '无法开始同步'));
    } finally {
      void queryClient.invalidateQueries({ queryKey: MV_SYNC_STATUS_KEY });
    }
  }

  function changeWindow(next: MvWindow) {
    setWindow(next);
    storeWindow(next);
  }

  function openIndicator(code: string) {
    setFocusCode(code);
    setTab(PROFITABILITY_CODES.has(code) ? 'profitability' : 'valuation');
  }

  function selectTab(id: TabId) {
    setFocusCode(null);
    setTab(id);
  }

  /** Builds the Markdown snapshot from the cached queries (fetching the ones this tab has not loaded yet). */
  async function buildSummary(): Promise<{ text: string; date: string } | null> {
    setCopying(true);
    try {
      const [d, markets, decomposition, catalog] = await Promise.all([
        queryClient.ensureQueryData(mvDashboardOptions(window)),
        queryClient.ensureQueryData(mvMarketsOptions()).catch(() => []),
        queryClient.ensureQueryData(mvDecompositionOptions()).catch(() => []),
        queryClient.ensureQueryData(mvCatalogOptions()).catch(() => []),
      ]);
      return { text: buildAiSummary(d, markets, decomposition, catalog), date: d.asOf ?? todayIso() };
    } catch (err) {
      toast.error(getErrorMessage(err, '摘要生成失败：总览数据未加载'));
      return null;
    } finally {
      setCopying(false);
    }
  }

  async function copySummary() {
    const summary = await buildSummary();
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.text);
      toast.success('已复制，可直接粘贴给 AI');
    } catch {
      toast.error('复制失败（浏览器未授权剪贴板），请改用“下载 .md”');
    }
  }

  async function downloadSummary() {
    const summary = await buildSummary();
    if (summary) downloadTextFile(summary.text, aiSummaryFileName(summary.date));
  }

  const data = dashboard.data;
  return (
    <div className="app-container">
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome} title="返回主页">⌂</button>
          <h1 className="app-title">美股估值监测</h1>
          <span className={styles.titleEn}>MARKET VALUATION</span>
        </div>
        <div className="header-right">
          <span className={styles.syncPill} data-running={running}>
            {running ? `⟳ 同步中${progressSuffix}` : data?.asOf ? `数据截至 ${data.asOf}` : ''}
          </span>
          <div className={styles.windowGroup} role="group" aria-label="分位窗口">
            <span className={styles.muted}>分位窗口</span>
            {MV_WINDOWS.map(w => (
              <button key={w.id} type="button" className={styles.chip} data-active={window === w.id} onClick={() => changeWindow(w.id)}>
                {w.label}
              </button>
            ))}
          </div>
          <button className="cancel-btn" onClick={() => void copySummary()} disabled={copying} title="复制估值与盈利快照（Markdown），粘贴给 AI 分析">
            📋 复制给 AI
          </button>
          <button className="cancel-btn" onClick={() => void downloadSummary()} disabled={copying} title="下载 Markdown 摘要">下载 .md</button>
          <button className="icon-btn" title="刷新" onClick={() => void queryClient.invalidateQueries({ queryKey: MV_KEY })}>↻</button>
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
          <OverviewTab dashboard={data} loading={dashboard.isLoading}
                       error={dashboard.isError ? getErrorMessage(dashboard.error, '总览加载失败') : null}
                       onOpen={openIndicator} />
        )}
        {tab === 'valuation' && <ValuationTab key={focusCode ?? ''} focusCodes={focusCode ? [focusCode] : []} window={window} />}
        {tab === 'markets' && <MarketsTab window={window} />}
        {tab === 'profitability' && (
          <ProfitabilityTab key={focusCode ?? ''} focusCode={focusCode} window={window}
                            fundamentalsDate={data?.profitability.netMargin.date ?? null} />
        )}
        {tab === 'settings' && <SettingsTab fredConfigured={data?.fredConfigured ?? false} onStartSync={startSync} />}
      </div>
    </div>
  );
}
