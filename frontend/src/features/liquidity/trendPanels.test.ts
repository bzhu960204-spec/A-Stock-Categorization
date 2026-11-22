import { describe, expect, it } from 'vitest';
import type { LiquidityCatalogEntry, LiquiditySeriesData } from '../../api';
import { bandWidth, buildCustomSeries, buildPanelSeries, panelCodes, PANELS } from './trendPanels';

const entry = (code: string, unit: string, extra: Partial<LiquidityCatalogEntry> = {}): LiquidityCatalogEntry => ({
  code, name: code, unit, frequency: 'DAILY', source: 'NYFED', kind: 'RAW', group: 'RATE', description: null, ...extra,
});
const catalog = new Map([
  entry('SOFR_P1', '%'), entry('SOFR_P99', '%'), entry('SOFR99_IORB', 'bp', { kind: 'DERIVED' }),
  entry('HY_OAS', '%'), entry('CDS_ORCL_5Y', 'bp', { kind: 'MANUAL' }), entry('TGA', 'bn'),
].map(e => [e.code, e]));

describe('bandWidth', () => {
  it('subtracts the lower edge from the upper one on shared dates only', () => {
    const lower: [string, number][] = [['2026-11-18', 3.85], ['2026-11-19', 3.85]];
    const upper: [string, number][] = [['2026-11-19', 3.98], ['2026-11-20', 4.0]];
    expect(bandWidth(lower, upper)).toEqual([['2026-11-19', 0.13]]);
  });
});

describe('panelCodes', () => {
  it('adds the band edges and manual series, without duplicates and within the 12-code limit', () => {
    const tail = PANELS.find(p => p.id === 'tail')!;
    expect(panelCodes(tail, [])).toEqual(['SOFR99_IORB', 'SOFR_P1', 'SOFR_P99']);

    const credit = PANELS.find(p => p.id === 'credit')!;
    const many = Array.from({ length: 20 }, (_, i) => `M_X${i}`);
    expect(panelCodes(credit, many)).toHaveLength(12);
    expect(panelCodes(credit, ['CDS_ORCL_5Y'])).toEqual(['HY_OAS', 'CDS_ORCL_5Y']);
  });
});

describe('buildPanelSeries', () => {
  it('draws the percentile band as an invisible base plus a filled width, and keeps the explicit right axis', () => {
    const tail = PANELS.find(p => p.id === 'tail')!;
    const data: LiquiditySeriesData = {
      SOFR_P1: [['2026-11-19', 3.85]], SOFR_P99: [['2026-11-19', 3.98]], SOFR99_IORB: [['2026-11-19', 8]],
    };
    const series = buildPanelSeries(tail, data, catalog, []);

    expect(series.map(s => s.key)).toEqual(['SOFR_P1-base', 'SOFR_P99-width', 'SOFR99_IORB']);
    expect(series[0]).toMatchObject({ helper: true, stack: 'band' });
    expect(series[1]).toMatchObject({ area: true, stack: 'band', points: [['2026-11-19', 0.13]] });
    expect(series[2].axis).toBe(1);
  });

  it('puts manual series with a different unit on the right axis and skips series without data', () => {
    const credit = PANELS.find(p => p.id === 'credit')!;
    const data: LiquiditySeriesData = { HY_OAS: [['2026-11-19', 3.52]], CDS_ORCL_5Y: [['2026-11-19', 257]] };
    const series = buildPanelSeries(credit, data, catalog, ['CDS_ORCL_5Y', 'M_EMPTY']);

    expect(series.map(s => [s.key, s.axis])).toEqual([['HY_OAS', 0], ['CDS_ORCL_5Y', 1]]);
  });
});

describe('SOMA and net-liquidity preset panels', () => {
  const somaCatalog = new Map([
    entry('SOMA_BILLS', 'bn'), entry('SOMA_COUPONS', 'bn'), entry('SOMA_MBS', 'bn'), entry('SOMA_TOTAL', 'bn'),
    entry('NET_LIQ', 'bn', { kind: 'DERIVED' }), entry('NET_LIQ_13W', 'bn', { kind: 'DERIVED' }),
  ].map(e => [e.code, e]));
  const point = (v: number): [string, number][] => [['2026-11-18', v]];

  it('stacks the three SOMA groups as areas and draws the total as a plain line', () => {
    const soma = PANELS.find(p => p.id === 'soma')!;
    const data: LiquiditySeriesData = {
      SOMA_BILLS: point(300), SOMA_COUPONS: point(4000), SOMA_MBS: point(2000), SOMA_TOTAL: point(6300),
    };
    const series = buildPanelSeries(soma, data, somaCatalog, []);

    expect(series.map(s => [s.key, s.stack, s.area])).toEqual([
      ['SOMA_BILLS', 'soma', true], ['SOMA_COUPONS', 'soma', true], ['SOMA_MBS', 'soma', true], ['SOMA_TOTAL', undefined, undefined],
    ]);
  });

  it('draws net liquidity as a line on the left axis and its 13-week change as bars', () => {
    const netLiq = PANELS.find(p => p.id === 'netliq')!;
    const data: LiquiditySeriesData = { NET_LIQ: point(5800), NET_LIQ_13W: point(120) };
    const series = buildPanelSeries(netLiq, data, somaCatalog, []);

    expect(series.map(s => [s.key, s.type, s.axis])).toEqual([['NET_LIQ', undefined, 0], ['NET_LIQ_13W', 'bar', 1]]);
  });
});

describe('buildCustomSeries', () => {
  const data: LiquiditySeriesData = { SOFR_P99: [['2026-11-19', 3.98]], SOFR99_IORB: [['2026-11-19', 8]], TGA: [['2026-11-19', 891]] };

  it('assigns axes by unit', () => {
    const series = buildCustomSeries(['SOFR_P99', 'SOFR99_IORB'], data, catalog)!;
    expect(series.map(s => s.axis)).toEqual([0, 1]);
  });

  it('refuses more than two units', () => {
    expect(buildCustomSeries(['SOFR_P99', 'SOFR99_IORB', 'TGA'], data, catalog)).toBeNull();
  });
});
