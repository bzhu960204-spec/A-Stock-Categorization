import {
  filterStocks, getArchivedStocks, getStocks, searchStocks,
  type Stock,
} from '../../api';

export type CategoryFilterMode = 'union' | 'intersection';

export interface StockListParams {
  archived: boolean;
  /** Already debounced/trimmed by the caller. */
  keyword: string;
  categoryIds: ReadonlySet<number>;
  mode: CategoryFilterMode;
}

/** Root key shared by every stock-list query, used for invalidation and cache patches. */
export const STOCKS_KEY = ['stocks'] as const;
export const CATEGORIES_KEY = ['categories'] as const;

/**
 * Query key for one stock-list request. Only the inputs the backend call
 * actually depends on are included, so e.g. typing in the archive view
 * (filtered client-side) doesn't trigger refetches.
 */
export function stockListKey({ archived, keyword, categoryIds, mode }: StockListParams) {
  if (archived) return [...STOCKS_KEY, 'archived'] as const;
  const ids = [...categoryIds].sort((a, b) => a - b);
  const kw = keyword.trim();
  if (kw) return [...STOCKS_KEY, 'search', kw, ids, ids.length ? mode : null] as const;
  if (ids.length) return [...STOCKS_KEY, 'filter', ids, mode] as const;
  return [...STOCKS_KEY, 'all'] as const;
}

/** The search endpoint ignores categories, so they are applied on the client. */
export function filterByCategories(stocks: Stock[], categoryIds: ReadonlySet<number>, mode: CategoryFilterMode): Stock[] {
  if (categoryIds.size === 0) return stocks;
  const wanted = [...categoryIds];
  return stocks.filter(stock => {
    const own = new Set((stock.categories ?? []).map(c => c.id));
    return mode === 'intersection' ? wanted.every(id => own.has(id)) : wanted.some(id => own.has(id));
  });
}

export async function fetchStockList(params: StockListParams, signal?: AbortSignal): Promise<Stock[]> {
  const { archived, categoryIds, mode } = params;
  const keyword = params.keyword.trim();
  if (archived) return (await getArchivedStocks(signal)).data;
  if (keyword) return filterByCategories((await searchStocks(keyword, signal)).data, categoryIds, mode);
  if (categoryIds.size > 0) return (await filterStocks([...categoryIds], mode, signal)).data;
  return (await getStocks(signal)).data;
}

/** Client-side keyword match used by the archive view (the search endpoint only covers active stocks). */
export function matchesKeyword(stock: Stock, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  return stock.code.toLowerCase().includes(kw) || stock.name.toLowerCase().includes(kw);
}
