// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { Stock } from '../../api';
import type { StockListParams } from './stockQueries';

const searchStocks = vi.fn();
vi.mock('../../api', () => ({
  searchStocks: (...args: unknown[]) => searchStocks(...args),
  getStocks: vi.fn(),
  filterStocks: vi.fn(),
  getArchivedStocks: vi.fn(),
  getCategories: vi.fn(),
  getStockTimeline: vi.fn(),
}));

const { useStockList } = await import('./useStockData');

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

const stock = (id: number, name: string): Stock => ({ id, code: String(id), name, notes: '', categories: [] });

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  searchStocks.mockReset();
});

describe('useStockList', () => {
  it('never lets a slow response for an older keyword overwrite the current result', async () => {
    const slow = deferred<{ data: Stock[] }>();
    const signals: AbortSignal[] = [];
    searchStocks.mockImplementation((keyword: string, signal: AbortSignal) => {
      signals.push(signal);
      return keyword === 'a' ? slow.promise : Promise.resolve({ data: [stock(2, 'ab-result')] });
    });

    const base: StockListParams = { archived: false, keyword: 'a', categoryIds: new Set(), mode: 'union' };
    const { result, rerender } = renderHook((p: StockListParams) => useStockList(p), { wrapper, initialProps: base });

    rerender({ ...base, keyword: 'ab' });
    await waitFor(() => expect(result.current.stocks.map(s => s.name)).toEqual(['ab-result']));

    // The superseded request is aborted, and even if it still resolves it must not win.
    expect(signals[0].aborted).toBe(true);
    await act(async () => { slow.resolve({ data: [stock(1, 'a-result')] }); });
    expect(result.current.stocks.map(s => s.name)).toEqual(['ab-result']);
  });
});
