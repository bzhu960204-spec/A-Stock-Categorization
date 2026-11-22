import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  getMarketEventsInRange, getMvCatalog, getMvDashboard, getMvDecomposition, getMvFactsetReports, getMvManualSeries,
  getMvMarkets, getMvPbRoeScatter, getMvSeries, getMvSyncStatus, type MvWindow,
} from '../../api';

/** Every market-valuation query key starts with this, so one invalidateQueries({ queryKey: MV_KEY }) refreshes all of them. */
export const MV_KEY = ['market-valuation'] as const;
export const MV_SYNC_STATUS_KEY = [...MV_KEY, 'sync-status'] as const;

const TEN_MINUTES = 10 * 60_000;
const SYNC_POLL_MS = 2000;
/** While idle, still poll slowly so a scheduled/other-tab sync shows up without a manual refresh. */
const SYNC_IDLE_POLL_MS = 30_000;

// Options objects (not just hooks) so the AI summary can fetch the same data on demand through the query cache.
export const mvDashboardOptions = (window: MvWindow) => queryOptions({
  queryKey: [...MV_KEY, 'dashboard', window],
  queryFn: () => getMvDashboard(window).then(r => r.data),
  staleTime: TEN_MINUTES,
});

export const mvCatalogOptions = () => queryOptions({
  queryKey: [...MV_KEY, 'catalog'],
  queryFn: () => getMvCatalog().then(r => r.data),
  staleTime: TEN_MINUTES,
});

export const mvMarketsOptions = () => queryOptions({
  queryKey: [...MV_KEY, 'markets'],
  queryFn: () => getMvMarkets().then(r => r.data),
  staleTime: TEN_MINUTES,
});

export const mvDecompositionOptions = () => queryOptions({
  queryKey: [...MV_KEY, 'decomposition'],
  queryFn: () => getMvDecomposition().then(r => r.data),
  staleTime: TEN_MINUTES,
});

export const useMvDashboard = (window: MvWindow) => useQuery(mvDashboardOptions(window));
export const useMvCatalog = () => useQuery(mvCatalogOptions());
export const useMvMarkets = () => useQuery(mvMarketsOptions());
export const useMvDecomposition = () => useQuery(mvDecompositionOptions());

/** `window` makes the backend return percentile-basis statistics next to the points. */
export const useMvSeries = (codes: string[], from: string, to: string, window?: MvWindow) => useQuery({
  queryKey: [...MV_KEY, 'series', codes, from, to, window],
  queryFn: () => getMvSeries(codes, from, to, window).then(r => r.data),
  enabled: codes.length > 0,
});

export const useMvScatter = () => useQuery({
  queryKey: [...MV_KEY, 'scatter'],
  queryFn: () => getMvPbRoeScatter().then(r => r.data),
});

export const useMvEvents = (from: string, to: string, enabled: boolean) => useQuery({
  queryKey: [...MV_KEY, 'events', from, to],
  queryFn: () => getMarketEventsInRange(from, to).then(r => r.data),
  enabled,
});

/** Polls every 2 seconds while a sync is running, every 30 seconds otherwise. */
export const useMvSyncStatus = () => useQuery({
  queryKey: MV_SYNC_STATUS_KEY,
  queryFn: () => getMvSyncStatus().then(r => r.data),
  staleTime: 0,
  refetchInterval: query => (query.state.data?.running ? SYNC_POLL_MS : SYNC_IDLE_POLL_MS),
});

export const useMvFactsetReports = () => useQuery({
  queryKey: [...MV_KEY, 'factset-reports'],
  queryFn: () => getMvFactsetReports(30).then(r => r.data),
});

export const useMvManualSeries = () => useQuery({
  queryKey: [...MV_KEY, 'manual-series'],
  queryFn: () => getMvManualSeries().then(r => r.data),
});
