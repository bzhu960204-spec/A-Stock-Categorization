import { describe, expect, it } from 'vitest';
import type { ValuationSnapshot } from '../../api';
import {
  METRICS, applyFilterRules, avgGrossMargin, bestMetricValue, buildImportTemplate, emptyForm, filterValue, fmtNum,
  formFromSnapshot, importItemToInput, latestByTicker, matchesRule, mergeImportIntoExisting, nextSort,
  parseImportJson, searchSnapshots, sortSnapshots, NUMERIC_FIELDS, type FilterRule,
} from './valuationUtils';

const snap = (id: number, extra: Partial<ValuationSnapshot> = {}): ValuationSnapshot =>
  ({ id, ticker: `T${id}`, companyName: `Co${id}`, snapshotDate: '2026-01-01', createdAt: '', ...extra });

const rule = (r: Partial<FilterRule>): FilterRule => ({ id: 1, key: 'pe', op: '<=', value: '', ...r });

describe('formatting and averages', () => {
  it('formats numbers and percentages, dash for missing', () => {
    expect(fmtNum(12.345)).toBe('12.3');
    expect(fmtNum(0.4567, true)).toBe('45.7%');
    expect(fmtNum(null)).toBe('—');
  });

  it('averages only the recorded quarters', () => {
    expect(avgGrossMargin(snap(1, { grossMarginQ1: 0.4, grossMarginQ3: 0.6 }))).toBeCloseTo(0.5);
    expect(avgGrossMargin(snap(1))).toBeNull();
  });
});

describe('form helpers', () => {
  it('emptyForm has every numeric field unset and today as date', () => {
    const f = emptyForm('2026-11-21');
    expect(f.snapshotDate).toBe('2026-11-21');
    for (const k of NUMERIC_FIELDS) expect(f[k]).toBeUndefined();
  });

  it('formFromSnapshot copies editable fields and defaults notes', () => {
    const f = formFromSnapshot(snap(1, { pe: 20, ttmRoicY4: 0.3 }));
    expect(f).toMatchObject({ ticker: 'T1', companyName: 'Co1', pe: 20, ttmRoicY4: 0.3, notes: '' });
    expect(f).not.toHaveProperty('id');
  });
});

describe('search / filter / sort', () => {
  const list = [
    snap(1, { pe: 10, grossMargin: 0.8, notes: 'cloud leader' }),
    snap(2, { pe: 30, grossMargin: 0.4 }),
    snap(3, {}),
  ];

  it('searches ticker, company name and notes', () => {
    expect(searchSnapshots(list, 'CLOUD').map(s => s.id)).toEqual([1]);
    expect(searchSnapshots(list, ' co2 ').map(s => s.id)).toEqual([2]);
    expect(searchSnapshots(list, '')).toBe(list);
  });

  it('compares margins as percentages', () => {
    expect(filterValue(list[0], 'grossMargin')).toBeCloseTo(80);
    expect(matchesRule(list[0], rule({ key: 'grossMargin', op: '>=', value: '50' }))).toBe(true);
    expect(matchesRule(list[1], rule({ key: 'grossMargin', op: '>=', value: '50' }))).toBe(false);
  });

  it('lets snapshots without the field and blank rules pass', () => {
    expect(matchesRule(list[2], rule({ value: '15' }))).toBe(true);
    expect(applyFilterRules(list, [rule({ value: '  ' })], 'AND')).toBe(list);
  });

  it('combines rules with AND / OR', () => {
    const rules = [rule({ id: 1, value: '15' }), rule({ id: 2, key: 'grossMargin', op: '<', value: '50' })];
    expect(applyFilterRules(list.slice(0, 2), rules, 'AND').map(s => s.id)).toEqual([]);
    expect(applyFilterRules(list.slice(0, 2), rules, 'OR').map(s => s.id)).toEqual([1, 2]);
  });

  it('sorts with missing values last in both directions', () => {
    expect(sortSnapshots(list, 'pe', 'asc').map(s => s.id)).toEqual([1, 2, 3]);
    expect(sortSnapshots(list, 'pe', 'desc').map(s => s.id)).toEqual([2, 1, 3]);
    expect(sortSnapshots(list, null, 'asc')).toBe(list);
  });

  it('cycles sort asc → desc → off', () => {
    let s = nextSort({ key: null, dir: 'asc' }, 'pe');
    expect(s).toEqual({ key: 'pe', dir: 'asc' });
    s = nextSort(s, 'pe');
    expect(s).toEqual({ key: 'pe', dir: 'desc' });
    expect(nextSort(s, 'pe')).toEqual({ key: null, dir: 'asc' });
    expect(nextSort(s, 'ps')).toEqual({ key: 'ps', dir: 'asc' });
  });
});

describe('comparison', () => {
  it('keeps the latest snapshot per ticker', () => {
    const latest = latestByTicker([
      snap(1, { ticker: 'A', snapshotDate: '2026-01-01' }),
      snap(2, { ticker: 'A', snapshotDate: '2026-03-01' }),
      snap(3, { ticker: 'B' }),
    ]);
    expect(latest.A.id).toBe(2);
    expect(latest.B.id).toBe(3);
  });

  it('highlights the best value only when comparing at least two', () => {
    const pe = METRICS.find(m => m.key === 'pe')!;
    expect(bestMetricValue([snap(1, { pe: 10 })], pe)).toBeNull();
    expect(bestMetricValue([snap(1, { pe: 10 }), snap(2, { pe: 5 })], pe)).toBe(5);
    const gm = METRICS.find(m => m.key === 'grossMargin')!;
    expect(bestMetricValue([snap(1, { grossMarginQ1: 0.5 }), snap(2, { grossMarginQ1: 0.7 })], gm)).toBe(0.7);
  });
});

describe('JSON import', () => {
  it('reports syntax and validation errors with the item index', () => {
    expect(parseImportJson('{', 'add')).toEqual({ error: 'JSON 格式错误，请检查语法' });
    expect(parseImportJson('[]', 'add')).toEqual({ error: '数组为空，请至少提供一条记录' });
    expect(parseImportJson('[{"ticker":"A","companyName":"x","snapshotDate":"2026-01-01"},{"ticker":"B"}]', 'add'))
      .toEqual({ error: '第 2 条：缺少 companyName 字段' });
    expect(parseImportJson('{"ticker":"A","companyName":"x"}', 'add'))
      .toEqual({ error: '第 1 条：新增模式下缺少 snapshotDate 字段（格式 YYYY-MM-DD）' });
  });

  it('accepts a single object and does not require a date in update mode', () => {
    expect(parseImportJson('{"ticker":"A","companyName":"x"}', 'update')).toEqual({ items: [{ ticker: 'A', companyName: 'x' }] });
  });

  it('converts an item, upper-casing the ticker and defaulting the date', () => {
    const input = importItemToInput({ ticker: 'aapl', companyName: 'Apple', pe: '28.5', ps: 'n/a' }, '2026-11-21');
    expect(input).toMatchObject({ ticker: 'AAPL', snapshotDate: '2026-11-21', pe: 28.5, notes: '' });
    expect(input.ps).toBeUndefined();
  });

  it('update mode keeps existing values for fields that are null or missing', () => {
    const existing = snap(9, { ticker: 'AAPL', pe: 20, ps: 5, notes: 'old' });
    const merged = mergeImportIntoExisting({ ticker: 'AAPL', companyName: 'Apple', pe: 25, ps: null, notes: '' }, existing, '2026-11-21');
    expect(merged).toMatchObject({ pe: 25, ps: 5, notes: 'old', snapshotDate: '2026-11-21' });
  });

  it('template lists each company with every numeric field null', () => {
    const [row] = buildImportTemplate([{ ticker: 'A', companyName: 'x' }]);
    expect(row).toMatchObject({ ticker: 'A', companyName: 'x', pe: null, ttmRoicY4: null, notes: '' });
    expect(Object.keys(row)).toHaveLength(NUMERIC_FIELDS.length + 3);
  });
});
