import type {
  LiquidityCard, LiquidityDashboard, LiquidityFetchLog, LiquidityStatus, LiquiditySyncProgress, LiquidityThresholdRule,
  LiquidityWeeklyReport, LiquiditySourceStatus,
} from '../../api';

// ---------- sync ----------

/** "2分10秒" / "35秒"; a log without an end time is measured up to {@code nowMs} (still running). */
export function elapsedText(start: string, end: string | null, nowMs: number = Date.now()): string {
  const endMs = end ? new Date(end).getTime() : nowMs;
  const seconds = Math.max(0, Math.round((endMs - new Date(start).getTime()) / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}分${seconds % 60}秒` : `${seconds}秒`;
}

/** "FRED（1/3） · 步骤 5/14 · UST2Y". */
export function describeProgress(p: LiquiditySyncProgress): string {
  const parts = [`${p.source}（${p.sourceIndex}/${p.sourceCount}）`];
  if (p.steps > 0) parts.push(`步骤 ${p.step}/${p.steps}`);
  if (p.label) parts.push(p.label);
  return parts.join(' · ');
}

/** A RUNNING row while the backend reports idle is a leftover from a run that died (restart / crash). */
export function isOrphanedRun(log: LiquidityFetchLog, running: boolean): boolean {
  return log.status === 'RUNNING' && !running;
}

// ---------- status ----------

export const STATUS_EMOJI: Record<LiquidityStatus, string> = { RED: '🔴', YELLOW: '🟡', GREEN: '🟢', NONE: '⚪' };
export const STATUS_LABEL: Record<LiquidityStatus, string> = { RED: '红', YELLOW: '黄', GREEN: '绿', NONE: '仅观察' };

/** Same rule as the backend (design §3.4): thresholds are inclusive; disabled rules or missing values are "observe only". */
export function evaluateStatus(
  rule: Pick<LiquidityThresholdRule, 'direction' | 'yellow' | 'red' | 'enabled'> | null | undefined,
  value: number | null | undefined,
): LiquidityStatus {
  if (!rule || !rule.enabled || value == null) return 'NONE';
  if (rule.direction === 'HIGHER_IS_WORSE') {
    if (value >= rule.red) return 'RED';
    if (value >= rule.yellow) return 'YELLOW';
  } else {
    if (value <= rule.red) return 'RED';
    if (value <= rule.yellow) return 'YELLOW';
  }
  return 'GREEN';
}

// ---------- number formatting ----------

const MINUS = '−';

function signed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return text; // avoid "+0.0" / "−0.0"
  return `${value > 0 ? '+' : MINUS}${text}`;
}

function trimNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** Value with its unit: bp is signed, bn >= 1000 becomes trillions of dollars ("2.97 万亿美元"). */
export function formatValue(value: number | null | undefined, unit: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  switch (unit) {
    case 'bp': return `${signed(value, 1)} bp`;
    case '%': return `${value.toFixed(2)}%`;
    case 'bn':
      if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)} 万亿美元`;
      return `${value.toFixed(Math.abs(value) < 10 ? 2 : 1)} bn`;
    case '天': return `${value.toFixed(0)} 天`;
    case 'idx':
    case 'pp': return value.toFixed(2);
    case 'stance': return signed(value, 1);
    default: return unit ? `${trimNumber(value)} ${unit}` : trimNumber(value);
  }
}

/** A change between two values: always signed, without the unit. */
export function formatChange(change: number | null | undefined, unit: string): string {
  if (change == null || !Number.isFinite(change)) return '—';
  switch (unit) {
    case 'bp': return signed(change, 1);
    case '%': return signed(change, 2);
    case 'bn': return signed(change, Math.abs(change) < 10 ? 2 : 1);
    case '天': return signed(change, 0);
    default: return signed(change, 2);
  }
}

/** Compact label for chart axes. */
export function formatAxisValue(value: number, unit: string): string {
  if (unit === 'bn' && Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}万亿`;
  if (unit === 'bp') return signed(value, 0);
  if (unit === '%') return `${Number(value.toFixed(2))}%`;
  return Number(value.toFixed(2)).toString();
}

// ---------- dates and ranges ----------

export type RangePreset = '1M' | '3M' | '6M' | '1Y' | '3Y' | 'ALL';
export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: '1M', label: '1M' }, { id: '3M', label: '3M' }, { id: '6M', label: '6M' },
  { id: '1Y', label: '1Y' }, { id: '3Y', label: '3Y' }, { id: 'ALL', label: '全部' },
];
export const HISTORY_START = '2018-04-01';

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const todayIso = () => toIsoDate(new Date());

/** Calendar-day arithmetic on "YYYY-MM-DD" strings (UTC based, so DST never shifts the result). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Subtracts calendar months, clamping the day (3 months before 2026-05-31 is 2026-02-28). */
export function subtractMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) - months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** Start date of a preset range ending at {@code today}; "ALL" starts at the history start. */
export function rangeStart(preset: RangePreset, today: string): string {
  switch (preset) {
    case '1M': return subtractMonths(today, 1);
    case '3M': return subtractMonths(today, 3);
    case '6M': return subtractMonths(today, 6);
    case '1Y': return subtractMonths(today, 12);
    case '3Y': return subtractMonths(today, 36);
    case 'ALL': return HISTORY_START;
  }
}

/** Mon-Fri days from {@code from} (exclusive) to {@code to} (inclusive); 0 when {@code to} is not later. */
export function businessDaysBetween(from: string, to: string): number {
  let count = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) {
    const [y, m, day] = d.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

/** A source whose newest observation is more than 3 business days old is stale; a skipped source (no key) is not. */
export function isSourceStale(source: LiquiditySourceStatus, today: string): boolean {
  if (!source.latestObsDate) return source.lastStatus !== 'SKIPPED';
  return businessDaysBetween(source.latestObsDate, today) > 3;
}

// ---------- overview banner ----------

export const OVERALL_CODES = ['SOFR_IORB', 'TGCR_IORB', 'SOFR99_IORB', 'LIQ_RATIO', 'SRF_AMT'] as const;

function bpText(v: number): string {
  return `${Math.abs(v).toFixed(1).replace(/\.0$/, '')}bp`;
}

function describeCard(card: LiquidityCard): string {
  const v = card.latest?.value ?? 0;
  switch (card.code) {
    case 'SOFR_IORB':
      return v > 0 ? `回购市场梗阻：SOFR 高于 IORB ${bpText(v)}` : v === 0 ? '回购市场承压：SOFR 触及 IORB' : `SOFR 逼近 IORB（低 ${bpText(v)}）`;
    case 'TGCR_IORB':
      return v > 0 ? `三方回购承压：TGCR 高于 IORB ${bpText(v)}` : v === 0 ? '三方回购承压：TGCR 触及 IORB' : `TGCR 逼近 IORB（低 ${bpText(v)}）`;
    case 'SOFR99_IORB':
      return v > 0 ? `尾部压力：SOFR 99 分位高于 IORB ${bpText(v)}` : `尾部压力上升：SOFR 99 分位仅低于 IORB ${bpText(v)}`;
    case 'LIQ_RATIO':
      return card.status === 'RED' ? `准备金比例 ${v.toFixed(2)}%，已触及 11% 悬崖边缘` : `准备金比例 ${v.toFixed(2)}%，接近 11% 悬崖边缘`;
    case 'SRF_AMT':
      return `美联储 SRF 出现实际使用（${formatValue(v, 'bn')}）`;
    default:
      return card.name;
  }
}

/** One-sentence conclusion for the banner, derived from the worst of the five overall indicators. */
export function buildHeadline(d: LiquidityDashboard): string {
  const status = d.overallStatus;
  if (status === 'NONE') return `${STATUS_EMOJI.NONE} 暂无足够数据（等待同步完成，或先配置 FRED API Key）`;
  const worst = OVERALL_CODES
    .map(code => d.cards.find(c => c.code === code))
    .filter((c): c is LiquidityCard => !!c && c.status === status);
  if (status === 'GREEN' || worst.length === 0) return `${STATUS_EMOJI.GREEN} 回购市场运转正常，暂无预警`;
  return `${STATUS_EMOJI[status]} ${describeCard(worst[0])}`;
}

// ---------- custom chart panel ----------

export const MAX_CUSTOM_SERIES = 6;

/**
 * Assigns each unit to the left (0) or right (1) axis in order of first use.
 * Returns null when more than two different units are selected (the chart only has two axes).
 */
export function assignAxes(units: string[]): Record<string, 0 | 1> | null {
  const distinct = [...new Set(units)];
  if (distinct.length > 2) return null;
  return Object.fromEntries(distinct.map((u, i) => [u, i as 0 | 1]));
}

// ---------- manual observations input ----------

export interface ParsedObservations {
  points: { date: string; value: number }[];
  errors: string[];
}

/** Parses pasted lines such as "2026-11-19,257" (comma, tab, space or semicolon separated); blank lines are ignored. */
export function parseObservationLines(text: string): ParsedObservations {
  const points: ParsedObservations['points'] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[,;\t ]+/);
    const [date, rawValue] = parts;
    const value = Number(rawValue);
    const valid = parts.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date).getTime())
      && Number.isFinite(value);
    if (valid) points.push({ date, value });
    else errors.push(`第 ${i + 1} 行格式不正确：${line}`);
  });
  return { points, errors };
}

export const MANUAL_CODE_PATTERN = /^(M|CDS)_[A-Z0-9_]{1,36}$/;

// ---------- weekly report markdown ----------

const mdCell = (text: string) => text.replace(/\|/g, '\\|');

export function weeklyFileName(weekEnd: string): string {
  return `美元环流周报-${weekEnd}.md`;
}

export function buildWeeklyMarkdown(report: LiquidityWeeklyReport, commentary: string | null | undefined): string {
  const lines: string[] = [];
  lines.push(`# 美元环流周报 ${report.weekStart} ~ ${report.weekEnd}`);
  lines.push('');
  lines.push(`> 综合状态：${STATUS_EMOJI[report.overallStatus]} ${STATUS_LABEL[report.overallStatus]} ｜ 数据截至 ${report.dataAsOf ?? '—'}`);
  lines.push('');
  lines.push('| 指标 | 本周 | 上周 | 变化 | 状态 |');
  lines.push('|---|---|---|---|---|');
  for (const r of report.rows) {
    const label = r.note ? `${r.label}（${r.note}）` : r.label;
    const status = r.status === 'NONE' ? '' : STATUS_EMOJI[r.status];
    lines.push(`| ${mdCell(label)} | ${formatValue(r.current, r.unit)} | ${formatValue(r.previous, r.unit)} | ${formatChange(r.change, r.unit)} | ${status} |`);
  }
  lines.push('');
  lines.push('## 观察要点');
  for (const o of report.observations) lines.push(`- ${o}`);
  const note = commentary?.trim();
  if (note) {
    lines.push('');
    lines.push('## 我的点评');
    lines.push(note);
  }
  return `${lines.join('\n')}\n`;
}

export function downloadTextFile(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
