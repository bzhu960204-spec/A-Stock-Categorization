import { describe, expect, it } from 'vitest';
import type {
  LiquidityCard, LiquidityDashboard, LiquidityFetchLog, LiquiditySourceStatus, LiquidityWeeklyReport,
} from '../../api';
import {
  assignAxes, buildHeadline, buildWeeklyMarkdown, businessDaysBetween, describeProgress, elapsedText, evaluateStatus,
  formatAxisValue, formatChange, formatValue, isOrphanedRun, isSourceStale, parseObservationLines, rangeStart,
  subtractMonths, weeklyFileName,
} from './liquidityUtils';

describe('sync helpers', () => {
  const log = { status: 'RUNNING' } as LiquidityFetchLog;

  it('formats elapsed time, measuring unfinished runs up to now', () => {
    expect(elapsedText('2026-11-22T09:00:00', '2026-11-22T09:00:35')).toBe('35秒');
    expect(elapsedText('2026-11-22T09:00:00', '2026-11-22T09:02:10')).toBe('2分10秒');
    expect(elapsedText('2026-11-22T09:00:00', null, new Date('2026-11-22T09:01:05').getTime())).toBe('1分5秒');
  });

  it('describes progress and flags a RUNNING row that nothing is working on', () => {
    expect(describeProgress({ source: 'FRED', sourceIndex: 1, sourceCount: 3, step: 5, steps: 14, label: 'UST2Y', startedAt: '' }))
      .toBe('FRED（1/3） · 步骤 5/14 · UST2Y');
    expect(describeProgress({ source: 'FEDTEXT', sourceIndex: 3, sourceCount: 3, step: 0, steps: 0, label: null, startedAt: '' }))
      .toBe('FEDTEXT（3/3）');
    expect(isOrphanedRun(log, false)).toBe(true);
    expect(isOrphanedRun(log, true)).toBe(false);
  });
});

describe('evaluateStatus', () => {
  const higher = { direction: 'HIGHER_IS_WORSE', yellow: -2, red: 0, enabled: true } as const;
  const lower = { direction: 'LOWER_IS_WORSE', yellow: 12.5, red: 11, enabled: true } as const;

  it('treats thresholds as inclusive for HIGHER_IS_WORSE', () => {
    expect(evaluateStatus(higher, -2.01)).toBe('GREEN');
    expect(evaluateStatus(higher, -2)).toBe('YELLOW');
    expect(evaluateStatus(higher, -0.01)).toBe('YELLOW');
    expect(evaluateStatus(higher, 0)).toBe('RED');
  });

  it('treats thresholds as inclusive for LOWER_IS_WORSE', () => {
    expect(evaluateStatus(lower, 12.51)).toBe('GREEN');
    expect(evaluateStatus(lower, 12.5)).toBe('YELLOW');
    expect(evaluateStatus(lower, 11.01)).toBe('YELLOW');
    expect(evaluateStatus(lower, 11)).toBe('RED');
  });

  it('is observe-only without a rule, a disabled rule or a value', () => {
    expect(evaluateStatus(null, 1)).toBe('NONE');
    expect(evaluateStatus({ ...higher, enabled: false }, 5)).toBe('NONE');
    expect(evaluateStatus(higher, null)).toBe('NONE');
  });
});

describe('number formatting', () => {
  it('signs basis points and uses a real minus sign', () => {
    expect(formatValue(2, 'bp')).toBe('+2.0 bp');
    expect(formatValue(-3.25, 'bp')).toBe('−3.3 bp');
    expect(formatValue(0, 'bp')).toBe('0.0 bp');
  });

  it('shows billions of dollars as trillions from 1000 upwards', () => {
    expect(formatValue(891.223, 'bn')).toBe('891.2 bn');
    expect(formatValue(0.401, 'bn')).toBe('0.40 bn');
    expect(formatValue(2965.4, 'bn')).toBe('2.97 万亿美元');
    expect(formatValue(1000, 'bn')).toBe('1.00 万亿美元');
  });

  it('formats the index and percentage-point units as plain two-digit decimals', () => {
    expect(formatValue(28.444, 'idx')).toBe('28.44');
    expect(formatValue(-0.87, 'idx')).toBe('-0.87');
    expect(formatValue(0.5, 'pp')).toBe('0.50');
    expect(formatValue(null, 'idx')).toBe('—');
  });

  it('formats percentages, days, custom units and missing values', () => {
    expect(formatValue(3.912, '%')).toBe('3.91%');
    expect(formatValue(3, '天')).toBe('3 天');
    expect(formatValue(257, 'bp')).toBe('+257.0 bp');
    expect(formatValue(null, '%')).toBe('—');
    expect(formatValue(Number.NaN, 'bn')).toBe('—');
  });

  it('formats changes as signed numbers without a unit', () => {
    expect(formatChange(-7, 'bp')).toBe('−7.0');
    expect(formatChange(0.01, '%')).toBe('+0.01');
    expect(formatChange(52, 'bn')).toBe('+52.0');
    expect(formatChange(null, 'bn')).toBe('—');
  });

  it('abbreviates axis labels', () => {
    expect(formatAxisValue(2965, 'bn')).toBe('3.0万亿');
    expect(formatAxisValue(-5, 'bp')).toBe('−5');
    expect(formatAxisValue(3.5, '%')).toBe('3.5%');
  });
});

describe('date ranges', () => {
  it('subtracts calendar months and clamps the day', () => {
    expect(subtractMonths('2026-05-31', 3)).toBe('2026-02-28');
    expect(subtractMonths('2026-01-15', 1)).toBe('2025-12-15');
    expect(subtractMonths('2026-11-22', 36)).toBe('2023-11-22');
  });

  it('maps presets to a start date; ALL starts at the history start', () => {
    expect(rangeStart('1M', '2026-11-22')).toBe('2026-10-22');
    expect(rangeStart('1Y', '2026-11-22')).toBe('2025-11-22');
    expect(rangeStart('ALL', '2026-11-22')).toBe('2018-04-01');
  });

  it('counts business days only', () => {
    expect(businessDaysBetween('2026-11-19', '2026-11-20')).toBe(1);
    expect(businessDaysBetween('2026-11-20', '2026-11-23')).toBe(1); // Fri -> Mon
    expect(businessDaysBetween('2026-11-20', '2026-11-22')).toBe(0);
    expect(businessDaysBetween('2026-11-20', '2026-11-20')).toBe(0);
  });

  it('flags a source stale after more than 3 business days, but not a skipped one without data', () => {
    const src = (latestObsDate: string | null, lastStatus: LiquiditySourceStatus['lastStatus']): LiquiditySourceStatus =>
      ({ source: 'NYFED', lastSuccessAt: null, lastStatus, latestObsDate });
    expect(isSourceStale(src('2026-11-19', 'SUCCESS'), '2026-11-22')).toBe(false);
    expect(isSourceStale(src('2026-11-12', 'SUCCESS'), '2026-11-22')).toBe(true);
    expect(isSourceStale(src(null, 'FAILED'), '2026-11-22')).toBe(true);
    expect(isSourceStale(src(null, 'SKIPPED'), '2026-11-22')).toBe(false);
  });
});

describe('assignAxes', () => {
  it('puts the first unit on the left axis and the second on the right', () => {
    expect(assignAxes(['%', 'bp', '%'])).toEqual({ '%': 0, bp: 1 });
    expect(assignAxes(['bp'])).toEqual({ bp: 0 });
  });

  it('refuses more than two units', () => {
    expect(assignAxes(['%', 'bp', 'bn'])).toBeNull();
  });
});

describe('parseObservationLines', () => {
  it('parses comma, tab and space separated lines and ignores blanks', () => {
    const r = parseObservationLines('2026-11-18,305\n\n2026-11-19\t257.5\n2026-11-20 260');
    expect(r.errors).toEqual([]);
    expect(r.points).toEqual([
      { date: '2026-11-18', value: 305 }, { date: '2026-11-19', value: 257.5 }, { date: '2026-11-20', value: 260 },
    ]);
  });

  it('reports bad lines with their line number and keeps the good ones', () => {
    const r = parseObservationLines('2026-11-18,305\nnot-a-date,5\n2026-11-19,abc\n2026-13-45,1');
    expect(r.points).toHaveLength(1);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[0]).toContain('第 2 行');
  });
});

const card = (code: string, status: LiquidityCard['status'], value: number): LiquidityCard => ({
  code, name: code, unit: 'bp', row: 1, latest: { date: '2026-11-19', value }, prevWeek: null, change: null, status,
  spark: [], needsFredKey: false,
});

const dashboard = (overallStatus: LiquidityDashboard['overallStatus'], cards: LiquidityCard[]): LiquidityDashboard => ({
  asOf: '2026-11-19', overallStatus, cards, sources: [], fredConfigured: true, syncRunning: false, observationCount: 1,
});

describe('buildHeadline', () => {
  it('names the repo-market blockage when SOFR is above IORB', () => {
    const d = dashboard('RED', [card('SOFR_IORB', 'RED', 3), card('LIQ_RATIO', 'YELLOW', 12)]);
    expect(buildHeadline(d)).toBe('🔴 回购市场梗阻：SOFR 高于 IORB 3bp');
  });

  it('reports a calm market and the missing-data case', () => {
    expect(buildHeadline(dashboard('GREEN', [card('SOFR_IORB', 'GREEN', -4)]))).toContain('运转正常');
    expect(buildHeadline(dashboard('NONE', []))).toContain('暂无足够数据');
  });
});

describe('buildWeeklyMarkdown', () => {
  const report: LiquidityWeeklyReport = {
    weekStart: '2026-11-16', weekEnd: '2026-11-20', dataAsOf: '2026-11-20', overallStatus: 'RED',
    rows: [
      { key: 'SOFR_EFFR_AVG', label: 'SOFR − EFFR（周均）', unit: 'bp', basis: '周均', current: 2, previous: 9, change: -7, status: 'YELLOW', dataDate: '2026-11-19', note: null },
      { key: 'RESERVES', label: '准备金', unit: 'bn', basis: '', current: 2965.4, previous: 2950, change: 15.4, status: 'NONE', dataDate: '2026-11-11', note: '未更新，沿用 2026-11-11 的数据' },
      { key: 'SRF_MAX', label: 'SRF | 单日最高', unit: 'bn', basis: '', current: null, previous: null, change: null, status: 'NONE', dataDate: null, note: null },
    ],
    observations: ['SOFR 本周有 3 天高于 IORB，最高 +5.0bp。', 'TGA 较上周增加 520 亿美元，抽走准备金。'],
  };

  it('renders the documented layout', () => {
    const md = buildWeeklyMarkdown(report, '  本周重点看回购市场。 ');
    expect(md).toBe([
      '# 美元环流周报 2026-11-16 ~ 2026-11-20',
      '',
      '> 综合状态：🔴 红 ｜ 数据截至 2026-11-20',
      '',
      '| 指标 | 本周 | 上周 | 变化 | 状态 |',
      '|---|---|---|---|---|',
      '| SOFR − EFFR（周均） | +2.0 bp | +9.0 bp | −7.0 | 🟡 |',
      '| 准备金（未更新，沿用 2026-11-11 的数据） | 2.97 万亿美元 | 2.95 万亿美元 | +15.4 |  |',
      '| SRF \\| 单日最高 | — | — | — |  |',
      '',
      '## 观察要点',
      '- SOFR 本周有 3 天高于 IORB，最高 +5.0bp。',
      '- TGA 较上周增加 520 亿美元，抽走准备金。',
      '',
      '## 我的点评',
      '本周重点看回购市场。',
      '',
    ].join('\n'));
  });

  it('omits the commentary section when there is none', () => {
    expect(buildWeeklyMarkdown(report, '  ')).not.toContain('我的点评');
    expect(buildWeeklyMarkdown(report, null)).not.toContain('我的点评');
  });

  it('names the file after the week end', () => {
    expect(weeklyFileName('2026-11-20')).toBe('美元环流周报-2026-11-20.md');
  });
});
