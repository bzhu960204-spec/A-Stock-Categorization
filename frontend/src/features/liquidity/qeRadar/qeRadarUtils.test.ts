import { describe, expect, it } from 'vitest';
import type { QeReplayLead } from '../../../api';
import {
  buildRadarSummary, categoryInfo, formatLeadDays, LIKELIHOOD_LABEL, RADAR_STATUS_LABEL, sortLeads, splitByHits,
  STAGE_INFO, stageLabel, stageStepPoints,
} from './qeRadarUtils';

const lead = (code: string, leadDaysYellow: number | null, leadDaysRed: number | null): QeReplayLead => ({
  code, name: code, firstYellow: null, firstRed: null, leadDaysYellow, leadDaysRed,
});

describe('stage and wording tables', () => {
  it('covers L0 to L4 with names in order and plain-language text', () => {
    expect(STAGE_INFO.map(s => s.name)).toEqual(['收水（QT）', '中性', '技术性扩表', '紧急注入', 'QE']);
    expect(STAGE_INFO.every((s, i) => s.level === i && s.plain.length > 0)).toBe(true);
    expect(stageLabel(2)).toBe('L2 技术性扩表');
    expect(stageLabel(9, '未知')).toBe('L9 未知');
  });

  it('maps likelihood and status lights to the radar wording', () => {
    expect(LIKELIHOOD_LABEL).toEqual({ LOW: '低', MEDIUM: '中', HIGH: '高' });
    expect([RADAR_STATUS_LABEL.GREEN, RADAR_STATUS_LABEL.YELLOW, RADAR_STATUS_LABEL.RED]).toEqual(['无信号', '弱信号', '强信号']);
  });

  it('keeps unknown text categories readable', () => {
    expect(categoryInfo('RMP')).toEqual({ label: '储备管理购买', level: 2 });
    expect(categoryInfo('NEW_RULE')).toEqual({ label: 'NEW_RULE', level: null });
  });
});

describe('buildRadarSummary', () => {
  const base = { stage: { level: 1, name: '中性', triggers: [], since: null, announced: null } };

  it('includes unread alerts only when there are some', () => {
    expect(buildRadarSummary({ ...base, likelihood: { level: 'MEDIUM', reasons: [] }, unreadAlerts: 2 }))
      .toBe('放水雷达：L1 中性 ｜ 升级可能性：中 ｜ 未读提醒 2 →');
    expect(buildRadarSummary({ ...base, likelihood: { level: 'LOW', reasons: [] }, unreadAlerts: 0 }))
      .toBe('放水雷达：L1 中性 ｜ 升级可能性：低 →');
  });
});

describe('replay leads', () => {
  it('sorts by weak-signal lead time, then strong-signal lead time, with never-fired indicators last', () => {
    const sorted = sortLeads([lead('A', null, null), lead('B', 30, 5), lead('C', 165, 67), lead('D', 30, 20)]);
    expect(sorted.map(l => l.code)).toEqual(['C', 'D', 'B', 'A']);
  });

  it('does not mutate its input and formats the day counts', () => {
    const input = [lead('A', 1, null), lead('B', 9, null)];
    sortLeads(input);
    expect(input.map(l => l.code)).toEqual(['A', 'B']);
    expect([formatLeadDays(165), formatLeadDays(0), formatLeadDays(null)]).toEqual(['165 天', '当天', '—']);
  });
});

describe('stageStepPoints', () => {
  it('emits both ends of each segment and a single point for a one-day segment', () => {
    expect(stageStepPoints([
      { from: '2020-01-01', to: '2020-02-05', level: 1, triggers: [] },
      { from: '2020-02-12', to: '2020-02-12', level: 3, triggers: [] },
    ])).toEqual([['2020-01-01', 1], ['2020-02-05', 1], ['2020-02-12', 3]]);
  });
});

describe('splitByHits', () => {
  it('marks the matched sentences and keeps the rest of the body in order', () => {
    const body = 'Intro. The Desk will purchase Treasury bills. Outro.';
    expect(splitByHits(body, ['The Desk will purchase Treasury bills.'])).toEqual([
      { text: 'Intro. ', hit: false },
      { text: 'The Desk will purchase Treasury bills.', hit: true },
      { text: ' Outro.', hit: false },
    ]);
  });

  it('ignores sentences that are not in the body or overlap an earlier one', () => {
    expect(splitByHits('abc def', ['xyz'])).toEqual([{ text: 'abc def', hit: false }]);
    expect(splitByHits('abc def', ['abc de', 'c def'])).toEqual([
      { text: 'abc de', hit: true }, { text: 'f', hit: false },
    ]);
  });
});
