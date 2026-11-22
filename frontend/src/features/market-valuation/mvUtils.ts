import type {
  MvCard, MvCatalogEntry, MvDashboard, MvDecompositionRow, MvFetchLog, MvMarketRow, MvMarketWindowKey,
  MvProfitItem, MvSourceStatus, MvWindow, MvZLabel,
} from '../../api';
import { subtractMonths } from '../liquidity/liquidityUtils';

const MINUS = '−';
const DASH = '—';

// ---------- number formatting ----------

const finite = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);

/** Sign prefix; a value that rounds to zero gets none ("+0.00" / "−0.00" is noise). */
function signOf(value: number, digits: number, plus: boolean): string {
  if (Number(Math.abs(value).toFixed(digits)) === 0) return '';
  return value < 0 ? MINUS : plus ? '+' : '';
}

function trimNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** Codes whose level is a spread / growth rate, shown with an explicit + or −. */
const SIGNED_CODES = new Set([
  'ERP_REAL_D', 'ERP_NOM_D', 'ERP_FWD', 'SPX_EPS_YOY', 'FS_EPS_G_Q', 'FS_EPS_G_NY', 'FS_FWD_EPS_CHG_13W',
]);
export const isSignedCode = (code: string) => SIGNED_CODES.has(code);

/** x = multiple (2 decimals), % = 2 decimals, pt = thousands separators, bn >= 1000 becomes trillions. */
export function formatMvValue(value: number | null | undefined, unit: string, signed = false): string {
  if (!finite(value)) return DASH;
  const abs = Math.abs(value);
  const sign = signOf(value, 2, signed);
  switch (unit) {
    case 'x': return `${sign}${abs.toFixed(2)}x`;
    case '%': return `${sign}${abs.toFixed(2)}%`;
    case 'pt': return `${sign}${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    case 'bn':
      return abs >= 1000 ? `${sign}${(abs / 1000).toFixed(2)} 万亿美元` : `${sign}${abs.toFixed(abs < 10 ? 2 : 1)} bn`;
    default: return unit ? `${sign}${trimNumber(abs)} ${unit}` : `${sign}${trimNumber(abs)}`;
  }
}

/** A change between two values: always signed; percentage-point changes are written "pp". */
export function formatMvChange(change: number | null | undefined, unit: string): string {
  if (!finite(change)) return DASH;
  const digits = unit === 'pt' ? 1 : 2;
  const suffix = unit === '%' ? ' pp' : unit === 'x' ? 'x' : '';
  return `${signOf(change, digits, true)}${Math.abs(change).toFixed(digits)}${suffix}`;
}

/** Percent text such as "+12.3%" (return decomposition). */
export function formatSignedPercent(value: number | null | undefined, digits = 1): string {
  if (!finite(value)) return DASH;
  return `${signOf(value, digits, true)}${Math.abs(value).toFixed(digits)}%`;
}

export const formatPercentile = (p: number | null | undefined) => (finite(p) ? `${Math.round(p)}%` : DASH);

// ---------- percentile and z-score colouring (design §3.6) ----------

export type Tone = 'red' | 'orange' | 'grey' | 'lightgreen' | 'green' | 'none';

/** ≥ 80 red, 60–80 orange, 40–60 grey, 20–40 light green, < 20 green. The percentile is already direction-adjusted. */
export function percentileTone(p: number | null | undefined): Tone {
  if (!finite(p)) return 'none';
  if (p >= 80) return 'red';
  if (p >= 60) return 'orange';
  if (p >= 40) return 'grey';
  if (p >= 20) return 'lightgreen';
  return 'green';
}

/** Same bands as the backend: > +2 昂贵, +1..+2 高估, −1..+1 合理, −2..−1 低估, < −2 便宜. */
export function zLabel(z: number | null | undefined): MvZLabel | null {
  if (!finite(z)) return null;
  if (z > 2) return '昂贵';
  if (z > 1) return '高估';
  if (z >= -1) return '合理';
  if (z >= -2) return '低估';
  return '便宜';
}

const Z_TONE: Record<MvZLabel, Tone> = { 昂贵: 'red', 高估: 'orange', 合理: 'grey', 低估: 'lightgreen', 便宜: 'green' };
export const zTone = (label: MvZLabel | null | undefined): Tone => (label ? Z_TONE[label] : 'none');

/** CSS colours for the sparkline stroke (the variables are defined on the module body). */
export const TONE_COLOR: Record<Tone, string> = {
  red: 'var(--danger)', orange: 'var(--mv-orange)', grey: 'var(--text-muted)',
  lightgreen: 'var(--mv-lime)', green: 'var(--accent-3)', none: 'var(--text-muted)',
};

// ---------- percentile window ----------

export const MV_WINDOWS: { id: MvWindow; label: string }[] = [
  { id: '10Y', label: '10Y' }, { id: '20Y', label: '20Y' }, { id: 'SINCE_1990', label: '1990 至今' }, { id: 'ALL', label: '全部' },
];
export const DEFAULT_WINDOW: MvWindow = '20Y';
export const WINDOW_STORAGE_KEY = 'mv.window';

export function windowLabel(window: MvWindow): string {
  switch (window) {
    case '10Y': return '10 年';
    case '20Y': return '20 年';
    case 'SINCE_1990': return '1990 至今';
    case 'ALL': return '全部历史';
  }
}

/** First day of the percentile window ending at {@code latest}; null when it is open-ended. */
export function windowStart(window: MvWindow, latest: string): string | null {
  switch (window) {
    case '10Y': return subtractMonths(latest, 120);
    case '20Y': return subtractMonths(latest, 240);
    case 'SINCE_1990': return '1990-01-01';
    case 'ALL': return null;
  }
}

export function loadStoredWindow(): MvWindow {
  try {
    const stored = localStorage.getItem(WINDOW_STORAGE_KEY);
    return MV_WINDOWS.find(w => w.id === stored)?.id ?? DEFAULT_WINDOW;
  } catch {
    return DEFAULT_WINDOW;
  }
}

export function storeWindow(window: MvWindow): void {
  try {
    localStorage.setItem(WINDOW_STORAGE_KEY, window);
  } catch {
    // Storage disabled (private mode): the choice just is not remembered.
  }
}

/** The multi-market table only has 1Y / 5Y / 10Y / 20Y windows; the open-ended ones map to the longest. */
export function marketWindowFor(window: MvWindow): MvMarketWindowKey {
  return window === '10Y' ? '10Y' : '20Y';
}

export const MARKET_WINDOWS: MvMarketWindowKey[] = ['1Y', '5Y', '10Y', '20Y'];

// ---------- chart ranges ----------

export type ChartRange = '3Y' | '5Y' | '10Y' | '20Y' | '1990' | 'ALL';
export const CHART_RANGES: { id: ChartRange; label: string }[] = [
  { id: '3Y', label: '3Y' }, { id: '5Y', label: '5Y' }, { id: '10Y', label: '10Y' }, { id: '20Y', label: '20Y' },
  { id: '1990', label: '1990 至今' }, { id: 'ALL', label: '全部' },
];
/** Shiller data (multpl) starts in 1871. */
export const CHART_EARLIEST = '1871-01-01';

export function chartRangeStart(range: ChartRange, today: string): string {
  switch (range) {
    case '3Y': return subtractMonths(today, 36);
    case '5Y': return subtractMonths(today, 60);
    case '10Y': return subtractMonths(today, 120);
    case '20Y': return subtractMonths(today, 240);
    case '1990': return '1990-01-01';
    case 'ALL': return CHART_EARLIEST;
  }
}

/** Calendar days from {@code from} to {@code to} (negative when {@code to} is earlier). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

// ---------- sources and sync ----------

const SOURCE_NAMES: Record<string, string> = {
  YAHOO: 'Yahoo 行情', MULTPL: 'multpl', WPR: 'worldperatio', FACTSET: 'FactSet', FRED: 'FRED', MANUAL: '手动',
};
export const sourceName = (source: string) => SOURCE_NAMES[source] ?? source;

/** Calendar days without a new observation before a source is flagged; FactSet is weekly, the rest daily. */
const SOURCE_STALE_DAYS: Record<string, number> = { FACTSET: 14, FRED: 7 };
const DEFAULT_STALE_DAYS = 5;

export function isMvSourceStale(source: MvSourceStatus, today: string): boolean {
  if (!source.latestObsDate) return source.lastStatus !== 'SKIPPED';
  return daysBetween(source.latestObsDate, today) > (SOURCE_STALE_DAYS[source.source] ?? DEFAULT_STALE_DAYS);
}

/** A RUNNING row while the backend reports idle is a leftover from a run that died (restart / crash). */
export const isOrphanedMvRun = (log: Pick<MvFetchLog, 'status'>, running: boolean) => log.status === 'RUNNING' && !running;

// ---------- multi-market ----------

/** PE now minus the PE a year earlier; null while less than a year of history has accumulated. */
export function peChangeOneYear(history: [string, number][]): number | null {
  if (history.length < 2) return null;
  const [latestDate, latest] = history[history.length - 1];
  const target = subtractMonths(latestDate, 12);
  for (let i = history.length - 2; i >= 0; i -= 1) {
    if (history[i][0] <= target) return latest - history[i][1];
  }
  return null;
}

// ---------- manual series ----------

export const MV_MANUAL_CODE_PATTERN = /^M_[A-Z0-9_]{1,38}$/;

export interface ManualPreset {
  code: string;
  name: string;
  unit: string;
  description: string;
}

export const MANUAL_PRESETS: ManualPreset[] = [
  { code: 'M_SPX_NET_MARGIN_FS', name: '标普 500 净利率（FactSet 口径）', unit: '%', description: 'FactSet 不定期发布，比 multpl 推导的净利率更及时' },
  { code: 'M_SPX_BUYBACK_YIELD', name: '标普 500 回购收益率', unit: '%', description: '用于计算股东总回报率（股息率 + 净回购率）' },
  { code: 'M_NDX_ROE', name: '纳指 100 ROE', unit: '%', description: '无免费来源，手动录入' },
  { code: 'M_NDX_NET_MARGIN', name: '纳指 100 净利率', unit: '%', description: '无免费来源，手动录入' },
  { code: 'M_NDX_FWD_PE', name: '纳指 100 远期 PE', unit: 'x', description: '无免费来源，手动录入' },
];

// ---------- AI summary (design §6.8) ----------

const mdCell = (text: string) => text.replace(/\|/g, '\\|');

const CARD_NOTES: Record<string, string> = {
  SPX_CAPE_D: 'multpl 月度 + 日度外推',
  BUFFETT_D: 'Z.1 季度市值按 Wilshire 5000 外推 / GDP',
  SPX_PE_D: 'multpl TTM（报告口径）+ 日度外推',
  FS_FWD_PE: 'FactSet 每周，远期 12 个月',
  SPX_PS_D: 'multpl 季度 + 日度外推',
  SPX_DY_D: 'multpl + 日度外推',
  ERP_REAL_D: '1/CAPE − 10 年 TIPS 实际利率（主指标，越低越贵）',
  ERP_NOM_D: 'TTM 盈利收益率 − 10 年国债',
  ERP_FWD: '1/远期 PE − 10 年国债',
  TIPS10Y: 'FRED DFII10',
  RSP_SPY: '等权 / 市值加权',
};

function missingText(missing: 'NO_FRED_KEY' | 'NO_DATA'): string {
  return missing === 'NO_FRED_KEY' ? `${DASH}（未配置 FRED Key）` : `${DASH}（暂无数据）`;
}

const STALE_NOTE = '⚠️ 数据滞后';
const joinNotes = (...notes: (string | null | undefined | false)[]) => notes.filter(Boolean).join('；');

function cardRow(card: MvCard, catalog: Map<string, MvCatalogEntry>): string {
  const name = card.name || catalog.get(card.code)?.name || card.code;
  const unit = card.unit || catalog.get(card.code)?.unit || '';
  const missing = card.missing ?? (card.value == null ? 'NO_DATA' : null);
  if (missing) return `| ${mdCell(name)} | ${missingText(missing)} | ${DASH} | ${DASH} | ${DASH} | |`;
  const signed = isSignedCode(card.code);
  const value = `${formatMvValue(card.value, unit, signed)}${card.estimate ? '（估）' : ''}`;
  const prev = card.prev ? formatMvValue(card.prev.value, unit, signed) : DASH;
  const percentile = card.direction === 'NONE' ? DASH : formatPercentile(card.percentile);
  const note = joinNotes(CARD_NOTES[card.code], card.stale && STALE_NOTE);
  return `| ${mdCell(name)} | ${value} | ${card.date ?? DASH} | ${prev} | ${percentile} | ${mdCell(note)} |`;
}

function profitRow(item: MvProfitItem): string {
  const missing = item.missing ?? (item.value == null ? 'NO_DATA' : null);
  if (missing) return `| ${mdCell(item.name)} | ${missingText(missing)} | ${DASH} | ${DASH} | |`;
  const signed = isSignedCode(item.code);
  const prev = item.prev ? formatMvValue(item.prev.value, item.unit, signed) : DASH;
  const note = joinNotes(item.quarter && `对应 ${item.quarter}`, item.stale && STALE_NOTE);
  return `| ${mdCell(item.name)} | ${formatMvValue(item.value, item.unit, signed)} | ${item.date ?? DASH} | ${prev} | ${mdCell(note)} |`;
}

function temperatureLines(d: MvDashboard, units: Map<string, string>): string[] {
  const lines = ['', '## 估值温度分量', '| 分量 | 当前 | 数据日期 | 分位 | 样本起点 | 备注 |', '|---|---|---|---|---|---|'];
  for (const c of d.temperature.components) {
    const value = formatMvValue(c.value, units.get(c.code) ?? '', c.key === 'ERP');
    const note = c.excluded
      ? joinNotes('样本不足（不计入温度）', c.excludedReason)
      : joinNotes(c.key === 'ERP' && '越低越贵，已取反', `n=${c.n}`);
    const percentile = c.excluded ? DASH : formatPercentile(c.percentile);
    lines.push(`| ${c.name} | ${value} | ${c.date ?? DASH} | ${percentile} | ${c.sampleStart ?? DASH} | ${mdCell(note)} |`);
  }
  return lines;
}

function limitationLines(d: MvDashboard, markets: MvMarketRow[]): string[] {
  const lines = [
    '## 口径与局限',
    '- worldperatio / multpl / FactSet 的 PE 口径不同，不可直接比较数值。',
    '- 巴菲特指标的日度值由 Z.1 季度市值按 Wilshire 5000 外推。',
  ];
  const fundamentalsDate = d.profitability.netMargin.date ?? d.profitability.roe.date;
  lines.push(fundamentalsDate
    ? `- 净利率与 ROE 基于 multpl 每股销售额 / 净资产，最新只到 ${fundamentalsDate.slice(0, 7)}。`
    : '- 净利率与 ROE 基于 multpl 每股销售额 / 净资产，当前暂无数据。');
  if (markets.some(m => m.scopeNote)) lines.push('- 中国 / 中国香港 / 日本为市场级口径（MSCI / ETF 代理），并非沪深 300 / 恒生 / 日经 225 本身。');
  if (d.cards.some(c => c.stale) || Object.values(d.profitability).some(p => p.stale)) lines.push('- 标 ⚠️ 的数据已滞后，不是最新值。');
  if (!d.fredConfigured) lines.push('- 未配置 FRED Key：巴菲特指标、实际 ERP、利润 / GDP 等依赖 FRED 的指标缺失。');
  return lines;
}

/** The Markdown snapshot copied to the clipboard / downloaded for pasting into an AI chat. */
export function buildAiSummary(
  dashboard: MvDashboard, markets: MvMarketRow[], decomposition: MvDecompositionRow[], catalog: MvCatalogEntry[] = [],
): string {
  const byCode = new Map(catalog.map(c => [c.code, c]));
  const units = new Map<string, string>([
    ...catalog.map(c => [c.code, c.unit] as const),
    ...dashboard.cards.map(c => [c.code, c.unit] as const),
  ]);
  const windowText = windowLabel(dashboard.window);
  const { temperature, quadrant } = dashboard;
  const temp = temperature.value == null
    ? `估值温度：样本不足，暂无法计算（分位窗口 ${windowText}）`
    : `估值温度：${Math.round(temperature.value)} / 100（${temperature.level ?? DASH}；分位窗口 ${windowText}）`;

  const section = (title: string, group: MvCard['group']) => [
    '', `## ${title}`,
    `| 指标 | 当前 | 数据日期 | 1 个月前 | ${windowText}分位 | 备注 |`, '|---|---|---|---|---|---|',
    ...dashboard.cards.filter(c => c.group === group).map(c => cardRow(c, byCode)),
  ];

  const p = dashboard.profitability;
  const lines: string[] = [
    `# 美股估值与盈利快照（数据截至 ${dashboard.asOf ?? DASH}）`,
    '',
    `> ${temp}${quadrant ? `｜象限：${quadrant.text}` : ''}`,
    '> 说明：带“估”的为按最新价格外推的日度估算；分位 = 当前值在窗口内历史数据中的百分位。',
    ...temperatureLines(dashboard, units),
    ...section('绝对估值（标普 500）', 'ABSOLUTE'),
    ...section('相对估值', 'RELATIVE'),
    ...section('结构与情绪', 'STRUCTURE'),
    '', '## 盈利能力',
    '| 指标 | 当前 | 数据日期 | 上期 | 备注 |', '|---|---|---|---|---|',
    ...[p.epsYoy, p.fsEpsGrowthQ, p.fsEpsGrowthNextYear, p.fsFwdEpsChg13w, p.netMargin, p.roe, p.profitGdp].map(profitRow),
    '', '## 多市场 PE（相对 10 年均值）',
  ];

  if (markets.length === 0) {
    lines.push(`${DASH}（暂无数据）`);
  } else {
    lines.push('| 市场 | PE | 10 年均值 | z | 标签 | 口径 |', '|---|---|---|---|---|---|');
    for (const m of markets) {
      const w = m.windows['10Y'];
      const z = w?.z == null ? DASH : `${signOf(w.z, 2, true)}${Math.abs(w.z).toFixed(2)}`;
      lines.push(`| ${m.name} | ${formatMvValue(m.pe, 'x')} | ${formatMvValue(w?.avg, 'x')} | ${z} | ${w?.label ?? DASH} | ${m.scopeNote ?? 'ETF 口径 TTM PE'} |`);
    }
  }

  lines.push('', '## 回报拆解（TTM 口径）');
  if (decomposition.length === 0) {
    lines.push(`${DASH}（暂无数据）`);
  } else {
    lines.push('| 期限 | 总回报 | 盈利贡献 | 估值贡献 |', '|---|---|---|---|');
    for (const r of decomposition) {
      const t = r.ttm;
      lines.push(`| ${r.horizon} | ${formatSignedPercent(t?.total)} | ${formatSignedPercent(t?.earnings)} | ${formatSignedPercent(t?.valuation)} |`);
    }
  }

  lines.push(
    '', ...limitationLines(dashboard, markets),
    '', '## 请你分析',
    '1. 从价值投资角度，当前美股整体估值处于什么位置？主要由哪些指标驱动？',
    '2. 盈利增长能否消化当前估值？需要关注哪些风险信号？',
    '3. 与中国、中国香港、日本市场相比，美股的相对吸引力如何？',
  );
  return `${lines.join('\n')}\n`;
}

export const aiSummaryFileName = (date: string) => `美股估值摘要-${date}.md`;
