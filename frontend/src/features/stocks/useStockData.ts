import { useCallback, useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCategories, getStockTimeline, type Stock } from '../../api';
import { CATEGORIES_KEY, STOCKS_KEY, fetchStockList, stockListKey, type StockListParams } from './stockQueries';

/**
 * Stock list for the current filters. Each filter combination is its own
 * query, so a slow response for an older keyword can never overwrite the
 * list for the current one; superseded requests are aborted.
 */
export function useStockList(params: StockListParams) {
  const query = useQuery({
    queryKey: stockListKey(params),
    queryFn: ({ signal }) => fetchStockList(params, signal),
    // Keep showing the previous list while the next filter result loads (no flash of empty table).
    placeholderData: keepPreviousData,
  });
  return {
    stocks: query.data ?? EMPTY,
    isLoading: query.isPending,
    error: query.error,
  };
}

const EMPTY: Stock[] = [];

/** Cache helpers that keep every cached stock list consistent after a write. */
export function useStockCache() {
  const queryClient = useQueryClient();

  const patchStock = useCallback((updated: Stock) => {
    queryClient.setQueriesData<Stock[]>({ queryKey: STOCKS_KEY }, list =>
      list?.map(s => (s.id === updated.id ? updated : s)));
  }, [queryClient]);

  const removeStock = useCallback((id: number) => {
    queryClient.setQueriesData<Stock[]>({ queryKey: STOCKS_KEY }, list => list?.filter(s => s.id !== id));
    // Other views (e.g. archive vs. active) need the stock to show up, so refetch them in the background.
    void queryClient.invalidateQueries({ queryKey: STOCKS_KEY });
  }, [queryClient]);

  const refreshStocks = useCallback(
    () => queryClient.invalidateQueries({ queryKey: STOCKS_KEY }),
    [queryClient],
  );

  const refreshCategories = useCallback(
    () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
    [queryClient],
  );

  return useMemo(
    () => ({ patchStock, removeStock, refreshStocks, refreshCategories }),
    [patchStock, removeStock, refreshStocks, refreshCategories],
  );
}

export function useCategories() {
  const query = useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: async ({ signal }) => (await getCategories(signal)).data,
  });
  return { categories: query.data ?? EMPTY_CATEGORIES, error: query.error };
}

const EMPTY_CATEGORIES: never[] = [];

export function useStockTimeline(stockId: number | null) {
  const query = useQuery({
    queryKey: ['stock-timeline', stockId],
    queryFn: async ({ signal }) => (await getStockTimeline(stockId!, signal)).data,
    enabled: stockId != null,
    // The timeline changes with every edit; always fetch fresh when opened.
    staleTime: 0,
    gcTime: 0,
  });
  return { entries: query.data ?? [], loading: query.isFetching, error: query.error };
}
