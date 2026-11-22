import { describe, expect, it } from 'vitest';
import type { MvCard, MvDashboard, MvDecompositionRow, MvMarketRow, MvProfitItem } from '../../api';
import {
  aiSummaryFileName, buildAiSummary, chartRangeStart, formatMvChange, formatMvValue, formatSignedPercent, isMvSourceStale,
  marketWindowFor, MV_MANUAL_CODE_PATTERN, peChangeOneYear, percentileTone, windowStart, zLabel, zTone,
} from './mvUtils';

describe('number formatting', () => {
  it('formats multiples, percents, index points and signed spreads', () => {
    expect(formatMvValue(36.444, 'x')).toBe('36.44x');
    expect(formatMvValue(1.056, '%')).toBe('1.06%');
    expect(formatMvValue(7175.834, 'pt')).toBe('7,175.83');
    expect(formatMvValue(0.71, '%', true)).toBe('+0.71%');
    expect(formatMvValue(-0.3, '%', true)).toBe('−0.30%');
    expect(formatMvValue(0.001, '%', true)).toBe('0.00%');
    expect(formatMvValue(null, 'x')).toBe('—');
    expect(formatMvValue(Number.NaN, '%')).toBe('—');
  });

  it('formats changes with a sign and pp for percentage points', () => {
    expect(formatMvChange(0.16, '%')).toBe('+0.16 pp');
    expect(formatMvChange(-3.4, 'x')).toBe('−3.40x');
    expect(formatMvChange(0, '%')).toBe('0.00 pp');
    expect(formatMvChange(null, '%')).toBe('—');
    expect(formatSignedPercent(12.34)).toBe('+12.3%');
  });
});

describe('percentile colouring', () => {
  it('uses the 20 / 40 / 60 / 80 boundaries, lower bound inclusive', () => {
    expect(percentileTone(95)).toBe('red');
    expect(percentileTone(80)).toBe('red');
    expect(percentileTone(79.9)).toBe('orange');
    expect(percentileTone(60)).toBe('orange');
    expect(percentileTone(59.9)).toBe('grey');
    expect(percentileTone(40)).toBe('grey');
    expect(percentileTone(39.9)).toBe('lightgreen');
    expect(percentileTone(20)).toBe('lightgreen');
    expect(percentileTone(19.9)).toBe('green');
    expect(percentileTone(0)).toBe('green');
    expect(percentileTone(null)).toBe('none');
  });
});

describe('z labels', () => {
  it('matches the backend bands at the boundaries', () => {
    expect(zLabel(2.01)).toBe('昂贵');
    expect(zLabel(2)).toBe('高估');
    expect(zLabel(1.01)).toBe('高估');
    expect(zLabel(1)).toBe('合理');
    expect(zLabel(-1)).toBe('合理');
    expect(zLabel(-1.01)).toBe('低估');
    expect(zLabel(-2)).toBe('低估');
    expect(zLabel(-2.01)).toBe('便宜');
    expect(zLabel(null)).toBeNull();
  });

  it('colours the labels from expensive (red) to cheap (green)', () => {
    expect(['昂贵', '高估', '合理', '低估', '便宜'].map(l => zTone(l as never)))
      .toEqual(['red', 'orange', 'grey', 'lightgreen', 'green']);
  });
});

describe('windows and ranges', () => {
  it('turns a percentile window into its first day', () => {
    expect(windowStart('10Y', '2026-11-20')).toBe('2016-11-20');
    expect(windowStart('20Y', '2026-11-20')).toBe('2006-11-20');
    expect(windowStart('SINCE_1990', '2026-11-20')).toBe('1990-01-01');
    expect(windowStart('ALL', '2026-11-20')).toBeNull();
  });

  it('maps the header window onto the multi-market windows', () => {
    expect(marketWindowFor('10Y')).toBe('10Y');
    expect(marketWindowFor('20Y')).toBe('20Y');
    expect(marketWindowFor('ALL')).toBe('20Y');
  });

  it('computes chart range starts', () => {
    expect(chartRangeStart('3Y', '2026-11-22')).toBe('2023-11-22');
    expect(chartRangeStart('1990', '2026-11-22')).toBe('1990-01-01');
    expect(chartRangeStart('ALL', '2026-11-22')).toBe('1871-01-01');
  });
});

describe('peChangeOneYear', () => {
  it('is null until a year of history has accumulated', () => {
    expect(peChangeOneYear([])).toBeNull();
    expect(peChangeOneYear([['2026-11-20', 22.5]])).toBeNull();
    expect(peChangeOneYear([['2026-06-01', 20], ['2026-11-20', 22.5]])).toBeNull();
  });

  it('compares with the latest point at least a year old', () => {
    const history: [string, number][] = [['2025-11-10', 18], ['2025-11-19', 20], ['2026-03-01', 21], ['2026-11-20', 22.5]];
    expect(peChangeOneYear(history)).toBeCloseTo(2.5);
  });
});

describe('source staleness and manual codes', () => {
  const source = (name: string, latest: string | null, status = 'SUCCESS') => ({ source: name, lastSuccessAt: null, lastStatus: status, latestObsDate: latest });

  it('allows weekly FactSet data to be older than daily sources', () => {
    expect(isMvSourceStale(source('YAHOO', '2026-11-20'), '2026-11-22')).toBe(false);
    expect(isMvSourceStale(source('YAHOO', '2026-11-10'), '2026-11-22')).toBe(true);
    expect(isMvSourceStale(source('FACTSET', '2026-11-10'), '2026-11-22')).toBe(false);
    expect(isMvSourceStale(source('FRED', null, 'SKIPPED'), '2026-11-22')).toBe(false);
    expect(isMvSourceStale(source('MULTPL', null), '2026-11-22')).toBe(true);
  });

  it('requires the M_ prefix', () => {
    expect(MV_MANUAL_CODE_PATTERN.test('M_NDX_ROE')).toBe(true);
    expect(MV_MANUAL_CODE_PATTERN.test('CDS_ORCL')).toBe(false);
    expect(MV_MANUAL_CODE_PATTERN.test('M_lower')).toBe(false);
  });
});

// ---------- AI summary ----------

const profit = (code: string, name: string, over: Partial<MvProfitItem> = {}): MvProfitItem => ({
  code, name, unit: '%', value: 12.5, date: '2026-09-30', quarter: null, prev: { date: '2026-06-30', value: 11 },
  change: 1.5, stale: false, missing: null, ...over,
});

const card = (code: string, name: string, group: MvCard['group'], over: Partial<MvCard> = {}): MvCard => ({
  code, name, unit: 'x', group, direction: 'HIGHER_IS_EXPENSIVE', value: 36.44, date: '2026-11-20',
  prev: { date: '2026-10-20', value: 39.8 }, change: -3.36, percentile: 96.2, spark: [], stale: false, estimate: true,
  missing: null, ...over,
});

function dashboard(over: Partial<MvDashboard> = {}): MvDashboard {
  return {
    asOf: '2026-11-20',
    window: '20Y',
    temperature: {
      value: 91.3, level: '昂贵',
      components: [
        { key: 'CAPE', name: 'CAPE', code: 'SPX_CAPE_D', value: 36.44, date: '2026-11-20', percentile: 96.2, sampleStart: '2006-11-30', n: 240, excluded: false, excludedReason: null },
        { key: 'FWD_PE', name: '远期 PE', code: 'FS_FWD_PE', value: 17.1, date: '2026-11-20', percentile: null, sampleStart: '2017-11-30', n: 12, excluded: true, excludedReason: '月度样本 < 36' },
      ],
    },
    cards: [
      card('SPX_CAPE_D', 'CAPE', 'ABSOLUTE'),
      card('BUFFETT_D', '巴菲特指标', 'ABSOLUTE', { unit: '%', value: null, percentile: null, missing: 'NO_FRED_KEY', estimate: true }),
      card('FS_FWD_PE', '远期 PE', 'ABSOLUTE', { value: 17.1, estimate: false, stale: true, percentile: 55 }),
      card('ERP_REAL_D', '实际 ERP', 'RELATIVE', { unit: '%', value: 0.71, prev: { date: '2026-10-20', value: 0.55 }, direction: 'LOWER_IS_EXPENSIVE', percentile: 96.9 }),
      card('VIX', 'VIX', 'STRUCTURE', { unit: 'pt', value: 16.2, direction: 'NONE', percentile: null, estimate: false }),
    ],
    profitability: {
      epsYoy: profit('SPX_EPS_YOY', 'EPS 同比'),
      netMargin: profit('SPX_NET_MARGIN', '净利率', { date: '2025-09-30', stale: true }),
      roe: profit('SPX_ROE', 'ROE', { date: '2025-09-30' }),
      profitGdp: profit('PROFIT_GDP', '利润 / GDP', { value: null, missing: 'NO_FRED_KEY' }),
      fsEpsGrowthQ: profit('FS_EPS_G_Q', 'FactSet 当季 EPS 增速', { value: 32.9, quarter: 'Q3 2026', date: '2026-11-20' }),
      fsFwdEpsChg13w: profit('FS_FWD_EPS_CHG_13W', '远期 EPS 13 周修正', { value: 2.1 }),
      fsEpsGrowthNextYear: profit('FS_EPS_G_NY', '下一年 EPS 增速', { value: 16.4 }),
    },
    quadrant: { valuation: '昂贵', earnings: '强', text: '估值昂贵，但盈利高增长提供一定支撑' },
    sources: [],
    fredConfigured: false,
    syncRunning: false,
    hasData: true,
    ...over,
  };
}

const markets: MvMarketRow[] = [
  { market: 'SPX', name: '标普 500', scopeNote: null, date: '2026-11-20', pe: 22.55, windows: { '10Y': { avg: 20.1, sd: 2.5, z: 0.98, label: '合理' } }, history: [] },
  { market: 'JP', name: '日本市场', scopeNote: '市场级口径', date: '2026-11-20', pe: 14.31, windows: { '10Y': { avg: 15, sd: 2, z: -0.35, label: '合理' } }, history: [] },
];

const decomposition: MvDecompositionRow[] = [
  { horizon: '1Y', startDate: '2025-11-20', endDate: '2026-11-20', ttm: { total: 18.2, valuation: -3.1, earnings: 21.9 }, cape: null, forward: null },
  { horizon: '3Y', startDate: '2023-11-20', endDate: '2026-11-20', ttm: null, cape: null, forward: null },
];

describe('buildAiSummary', () => {
  const text = buildAiSummary(dashboard(), markets, decomposition);

  it('starts with the dynamic as-of date, temperature and quadrant', () => {
    expect(text.startsWith('# 美股估值与盈利快照（数据截至 2026-11-20）')).toBe(true);
    expect(text).toContain('> 估值温度：91 / 100（昂贵；分位窗口 20 年）｜象限：估值昂贵，但盈利高增长提供一定支撑');
    expect(text).toContain('带“估”的为按最新价格外推的日度估算');
  });

  it('writes estimate rows with the window percentile and the previous value', () => {
    expect(text).toContain('| CAPE | 36.44x（估） | 2026-11-20 | 39.80x | 96% | multpl 月度 + 日度外推 |');
    expect(text).toContain('| 实际 ERP | +0.71%（估） | 2026-11-20 | +0.55% | 97% |');
    expect(text).toContain('20 年分位');
  });

  it('keeps rows that need a FRED key instead of dropping them', () => {
    expect(text).toContain('| 巴菲特指标 | —（未配置 FRED Key） | — | — | — | |');
    expect(text).toContain('| 利润 / GDP | —（未配置 FRED Key） | — | — | |');
    expect(text).toContain('- 未配置 FRED Key：');
  });

  it('flags lagging data with a warning and states the fundamentals date from the data', () => {
    expect(text).toContain('| 远期 PE | 17.10x | 2026-11-20 | 39.80x | 55% | FactSet 每周，远期 12 个月；⚠️ 数据滞后 |');
    expect(text).toContain('| 净利率 | 12.50% | 2025-09-30 | 11.00% | ⚠️ 数据滞后 |');
    expect(text).toContain('最新只到 2025-09。');
  });

  it('marks temperature components without enough samples', () => {
    expect(text).toContain('| 远期 PE | 17.10x | 2026-11-20 | — | 2017-11-30 | 样本不足（不计入温度）；月度样本 < 36 |');
    const none = buildAiSummary(dashboard({ temperature: { value: null, level: null, components: [] }, quadrant: null }), [], []);
    expect(none).toContain('> 估值温度：样本不足，暂无法计算（分位窗口 20 年）');
    expect(none).not.toContain('象限');
  });

  it('lists the quarter of FactSet growth rates, markets and the TTM return decomposition', () => {
    expect(text).toContain('| FactSet 当季 EPS 增速 | +32.90% | 2026-11-20 | +11.00% | 对应 Q3 2026 |');
    expect(text).toContain('| 标普 500 | 22.55x | 20.10x | +0.98 | 合理 | ETF 口径 TTM PE |');
    expect(text).toContain('| 日本市场 | 14.31x | 15.00x | −0.35 | 合理 | 市场级口径 |');
    expect(text).toContain('| 1Y | +18.2% | +21.9% | −3.1% |');
    expect(text).toContain('| 3Y | — | — | — |');
    expect(text).toContain('## 请你分析');
  });

  it('handles missing markets / decomposition and a window other than 20 years', () => {
    const bare = buildAiSummary(dashboard({ window: 'SINCE_1990', fredConfigured: true }), [], []);
    expect(bare).toContain('分位窗口 1990 至今');
    expect(bare).toContain('1990 至今分位');
    expect(bare).not.toContain('未配置 FRED Key：');
    expect(bare).toContain('## 多市场 PE（相对 10 年均值）\n—（暂无数据）');
    expect(aiSummaryFileName('2026-11-20')).toBe('美股估值摘要-2026-11-20.md');
  });
});
