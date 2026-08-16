import type { Stock } from './api';

const STANDARD_MARKETS = new Set(['CN', 'US', 'JP', 'KR', 'TW', 'HK']);

export function computeCategoryCounts(stocks: Stock[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const s of stocks) {
    for (const c of s.categories || []) {
      map.set(c.id, (map.get(c.id) || 0) + 1);
    }
  }
  return map;
}

export function filterStocksByMarketAndStar(
  stocks: Stock[],
  marketFilters: Set<string>,
  starFilter: number | null,
): Stock[] {
  let result = stocks;
  if (marketFilters.size > 0) {
    result = result.filter(s => {
      const m = s.market || 'CN';
      if (marketFilters.has(m)) return true;
      return marketFilters.has('OTHER') && !STANDARD_MARKETS.has(m);
    });
  }
  if (starFilter !== null) {
    result = result.filter(s => (s.researchValue ?? 0) >= starFilter);
  }
  return result;
}
