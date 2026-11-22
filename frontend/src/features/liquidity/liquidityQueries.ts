import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ackAllQeAlerts, ackQeAlert, getLiquidityCatalog, getLiquidityDashboard, getLiquidityManualSeries, getLiquidityScatter,
  getLiquiditySeries, getLiquiditySnapshot, getLiquiditySnapshots, getLiquiditySyncStatus, getLiquidityThresholds,
  getLiquidityWeekly, getMarketEventsInRange, getQeAlerts, getQeEpisodes, getQeRadar, getQeReplay, getQeStageHistory,
  getQeText, getQeTexts, getQeUnreadCount,
} from '../../api';

/** Every liquidity query key starts with this, so one invalidateQueries({ queryKey: LIQUIDITY_KEY }) refreshes all of them. */
export const LIQUIDITY_KEY = ['liquidity'] as const;
/** Every QE radar query lives under this key, which is itself under LIQUIDITY_KEY. */
export const QE_KEY = [...LIQUIDITY_KEY, 'qe'] as const;
/** The home page badge is deliberately outside LIQUIDITY_KEY: it is requested before the module is opened. */
export const QE_UNREAD_KEY = ['qe-unread-count'] as const;

const FIVE_MINUTES = 5 * 60_000;
const SYNC_POLL_MS = 2000;
/** While idle, still poll slowly so a scheduled/other-tab sync (or one that died) shows up without a manual refresh. */
const SYNC_IDLE_POLL_MS = 30_000;

export const useLiquidityDashboard = () => useQuery({
  queryKey: [...LIQUIDITY_KEY, 'dashboard'],
  queryFn: () => getLiquidityDashboard().then(r => r.data),
  staleTime: FIVE_MINUTES,
});

export const useLiquidityCatalog = () => useQuery({
  queryKey: [...LIQUIDITY_KEY, 'catalog'],
  queryFn: () => getLiquidityCatalog().then(r => r.data),
});

export const useLiquiditySeries = (codes: string[], from: string, to: string) => useQuery({
  queryKey: [...LIQUIDITY_KEY, 'series', codes, from, to],
  queryFn: () => getLiquiditySeries(codes, from, to).then(r => r.data),
  enabled: codes.length > 0,
});

export const useLiquidityScatter = () => useQuery({
  queryKey: [...LIQUIDITY_KEY, 'scatter'],
  queryFn: () => getLiquidityScatter().then(r => r.data),
});

export const useLiquidityEvents = (from: string, to: string, enabled: boolean) => useQuery({
  queryKey: [...LIQUIDITY_KEY, 'events', from, to],
  queryFn: () => getMarketEventsInRange(from, to).then(r => r.data),
  enabled,
});

/** weekEnd undefined = the latest finished week (decided by the backend). */
export const useLiquidityWeekly = (weekEnd: string | undefined) => useQuery({
  queryKey: [...LIQUIDITY_KEY, 'weekly', weekEnd ?? 'latest'],
  queryFn: () => getLiquidityWeekly(weekEnd).then(r => r.data),
});

export const useLiquiditySnapshots = () => useQuery({
  queryKey: [...LIQUIDITY_KEY, 'snapshots'],
  queryFn: () => getLiquiditySnapshots().then(r => r.data),
});

export const useLiquiditySnapshot = (id: number | null) => useQuery({
  queryKey: [...LIQUIDITY_KEY, 'snapshot', id],
  queryFn: () => getLiquiditySnapshot(id as number).then(r => r.data),
  enabled: id != null,
});

/** Polls every 2 seconds while a sync is running, every 30 seconds otherwise. */
export const useLiquiditySyncStatus = () => useQuery({
  queryKey: [...LIQUIDITY_KEY, 'sync-status'],
  queryFn: () => getLiquiditySyncStatus().then(r => r.data),
  staleTime: 0,
  refetchInterval: query => (query.state.data?.running ? SYNC_POLL_MS : SYNC_IDLE_POLL_MS),
});

export const useLiquidityThresholds = () => useQuery({
  queryKey: [...LIQUIDITY_KEY, 'thresholds'],
  queryFn: () => getLiquidityThresholds().then(r => r.data),
});

export const useLiquidityManualSeries = () => useQuery({
  queryKey: [...LIQUIDITY_KEY, 'manual-series'],
  queryFn: () => getLiquidityManualSeries().then(r => r.data),
});

// ---------- QE radar ----------

export const useQeRadar = () => useQuery({
  queryKey: [...QE_KEY, 'radar'],
  queryFn: () => getQeRadar().then(r => r.data),
  staleTime: FIVE_MINUTES,
});

export const useQeStageHistory = (from: string) => useQuery({
  queryKey: [...QE_KEY, 'stage-history', from],
  queryFn: () => getQeStageHistory(from).then(r => r.data),
});

export const useQeTexts = () => useQuery({
  queryKey: [...QE_KEY, 'texts'],
  queryFn: () => getQeTexts().then(r => r.data),
});

export const useQeText = (id: number | null) => useQuery({
  queryKey: [...QE_KEY, 'text', id],
  queryFn: () => getQeText(id as number).then(r => r.data),
  enabled: id != null,
});

export const useQeEpisodes = () => useQuery({
  queryKey: [...QE_KEY, 'episodes'],
  queryFn: () => getQeEpisodes().then(r => r.data),
});

export const useQeReplay = (id: string | null) => useQuery({
  queryKey: [...QE_KEY, 'replay', id],
  queryFn: () => getQeReplay(id as string).then(r => r.data),
  enabled: id != null,
});

export const useQeAlerts = () => useQuery({
  queryKey: [...QE_KEY, 'alerts'],
  queryFn: () => getQeAlerts().then(r => r.data),
});

/** Unread alert count for the home page badge; a failure just means no badge. */
export const useQeUnreadCount = () => useQuery({
  queryKey: QE_UNREAD_KEY,
  queryFn: () => getQeUnreadCount().then(r => r.data.count),
  staleTime: 0,
  retry: false,
});

function useAckMutation<V>(action: (variables: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: QE_KEY }),
      queryClient.invalidateQueries({ queryKey: QE_UNREAD_KEY }),
    ]),
  });
}

export const useAckQeAlert = () => useAckMutation((id: number) => ackQeAlert(id));
export const useAckAllQeAlerts = () => useAckMutation<void>(() => ackAllQeAlerts());
