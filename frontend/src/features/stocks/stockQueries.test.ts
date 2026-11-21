import { describe, expect, it } from 'vitest';
import type { Stock } from '../../api';
import { filterByCategories, matchesKeyword, stockListKey, type StockListParams } from './stockQueries';

const cat = (id: number) => ({ id, name: `C${id}`, color: '#000' });
const stock = (id: number, catIds: number[] = [], extra: Partial<Stock> = {}): Stock =>
  ({ id, code: `C${id}`, name: `Name${id}`, notes: '', categories: catIds.map(cat), ...extra });

const params = (p: Partial<StockListParams> = {}): StockListParams =>
  ({ archived: false, keyword: '', categoryIds: new Set(), mode: 'union', ...p });

describe('stockListKey', () => {
  it('distinguishes all / filter / search / archived requests', () => {
    expect(stockListKey(params())).toEqual(['stocks', 'all']);
    expect(stockListKey(params({ categoryIds: new Set([2, 1]) }))).toEqual(['stocks', 'filter', [1, 2], 'union']);
    expect(stockListKey(params({ keyword: ' 茅台 ' }))).toEqual(['stocks', 'search', '茅台', [], null]);
    expect(stockListKey(params({ archived: true, keyword: 'x', categoryIds: new Set([1]) }))).toEqual(['stocks', 'archived']);
  });

  it('is independent of category insertion order', () => {
    expect(stockListKey(params({ categoryIds: new Set([3, 1, 2]) })))
      .toEqual(stockListKey(params({ categoryIds: new Set([1, 2, 3]) })));
  });

  it('ignores the filter mode when no categories are selected', () => {
    expect(stockListKey(params({ mode: 'intersection' }))).toEqual(stockListKey(params({ mode: 'union' })));
    expect(stockListKey(params({ keyword: 'a', mode: 'intersection' })))
      .toEqual(stockListKey(params({ keyword: 'a', mode: 'union' })));
  });

  it('changes when the keyword changes, so late responses for old keywords land in their own cache entry', () => {
    expect(stockListKey(params({ keyword: 'ab' }))).not.toEqual(stockListKey(params({ keyword: 'abc' })));
  });
});

describe('filterByCategories', () => {
  const stocks = [stock(1, [1, 2]), stock(2, [1]), stock(3, [])];
  const ids = (list: Stock[]) => list.map(s => s.id);

  it('returns the input when no category is selected', () => {
    expect(filterByCategories(stocks, new Set(), 'union')).toBe(stocks);
  });

  it('union keeps stocks having any selected category', () => {
    expect(ids(filterByCategories(stocks, new Set([2, 9]), 'union'))).toEqual([1]);
    expect(ids(filterByCategories(stocks, new Set([1]), 'union'))).toEqual([1, 2]);
  });

  it('intersection keeps stocks having all selected categories', () => {
    expect(ids(filterByCategories(stocks, new Set([1, 2]), 'intersection'))).toEqual([1]);
  });
});

describe('matchesKeyword', () => {
  it('matches code or name case-insensitively and treats blank as match-all', () => {
    const s = stock(1, [], { code: 'NVDA', name: 'NVIDIA Corp' });
    expect(matchesKeyword(s, 'nvd')).toBe(true);
    expect(matchesKeyword(s, ' corp ')).toBe(true);
    expect(matchesKeyword(s, 'amd')).toBe(false);
    expect(matchesKeyword(s, '  ')).toBe(true);
  });
});
