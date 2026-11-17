import { describe, expect, it } from 'vitest';
import type { Stock } from './api';
import { computeCategoryCounts, filterStocksByMarketAndStar } from './stockFilters';

function stock(id: number, overrides: Partial<Stock> = {}): Stock {
  return { id, code: String(id), name: `S${id}`, notes: '', categories: [], ...overrides };
}

const cat = (id: number) => ({ id, name: `C${id}`, color: '#000' });

describe('computeCategoryCounts', () => {
  it('counts how many stocks belong to each category', () => {
    const counts = computeCategoryCounts([
      stock(1, { categories: [cat(1), cat(2)] }),
      stock(2, { categories: [cat(1)] }),
      stock(3),
    ]);
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(counts.has(3)).toBe(false);
  });

  it('tolerates stocks without a categories array', () => {
    const broken = { ...stock(1), categories: undefined } as unknown as Stock;
    expect(computeCategoryCounts([broken]).size).toBe(0);
  });
});

describe('filterStocksByMarketAndStar', () => {
  const stocks = [
    stock(1, { market: 'CN', researchValue: 5 }),
    stock(2, { market: undefined, researchValue: 2 }), // missing market = CN
    stock(3, { market: 'US', researchValue: 3 }),
    stock(4, { market: 'SG' }), // non-standard market, no rating
  ];
  const ids = (list: Stock[]) => list.map(s => s.id);

  it('returns everything when no filters are active', () => {
    expect(filterStocksByMarketAndStar(stocks, new Set(), null)).toBe(stocks);
  });

  it('treats a missing market as CN', () => {
    expect(ids(filterStocksByMarketAndStar(stocks, new Set(['CN']), null))).toEqual([1, 2]);
  });

  it('OTHER matches only markets outside the standard list', () => {
    expect(ids(filterStocksByMarketAndStar(stocks, new Set(['OTHER']), null))).toEqual([4]);
    expect(ids(filterStocksByMarketAndStar(stocks, new Set(['US', 'OTHER']), null))).toEqual([3, 4]);
  });

  it('star filter keeps stocks rated at least N, unrated counts as 0', () => {
    expect(ids(filterStocksByMarketAndStar(stocks, new Set(), 3))).toEqual([1, 3]);
    expect(ids(filterStocksByMarketAndStar(stocks, new Set(), 0))).toEqual([1, 2, 3, 4]);
  });

  it('combines market and star filters', () => {
    expect(ids(filterStocksByMarketAndStar(stocks, new Set(['CN']), 3))).toEqual([1]);
  });
});
