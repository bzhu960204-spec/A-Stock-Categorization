import type {
  FedTextDocType, LiquidityStatus, QeAlertType, QeLikelihoodLevel, QeRadarView, QeReplayLead, QeStageSegment,
} from '../../../api';
import type { ChartPalette } from '../charts/chartPalette';

export interface StageInfo {
  level: number;
  name: string;
  /** Plain-language explanation (design §1.1). */
  plain: string;
  /** Typical historical periods. */
  periods: string;
}

export const STAGE_INFO: StageInfo[] = [
  {
    level: 0, name: '收水（QT）',
    plain: '美联储让持有的债券到期后不再续买，市场上的钱被慢慢抽走。',
    periods: '2017-10 ~ 2019-07；2022-06 ~ 2025-11',
  },
  {
    level: 1, name: '中性',
    plain: '不抽也不加：到期的钱再买回去，资产负债表大体持平。',
    periods: '2014-11 ~ 2017-09；2026 年下半年',
  },
  {
    level: 2, name: '技术性扩表',
    plain: '主动买短期国债给银行补准备金。官方说法是“不是 QE”，但效果是往系统里加钱。',
    periods: '2019-10 ~ 2020-02；2025-12 ~ 2026 年上半年',
  },
  {
    level: 3, name: '紧急注入',
    plain: '市场出事，用回购、贴现窗口、央行货币互换或临时工具救急。规模大，但通常是临时的。',
    periods: '2008-09；2019-09；2023-03（硅谷银行）',
  },
  {
    level: 4, name: 'QE',
    plain: '大规模、持续地买长期国债或 MBS，压低长期利率，持续加钱。',
    periods: '2008-11 ~ 2014-10；2020-03 ~ 2022-03',
  },
];

export const MAX_STAGE_LEVEL = STAGE_INFO.length - 1;

export const stageInfo = (level: number): StageInfo | undefined => STAGE_INFO[level];

/** "L1 中性"; falls back to the backend's name for a level this build does not know. */
export function stageLabel(level: number, fallbackName = ''): string {
  return `L${level} ${stageInfo(level)?.name ?? fallbackName}`.trim();
}

/** CSS colour of a stage, from the theme variables (--liq-yellow is defined by the liquidity body). */
const STAGE_CSS_COLORS = ['var(--text-muted)', 'var(--accent-3)', 'var(--accent)', 'var(--liq-yellow)', 'var(--danger)'];
export const stageCssColor = (level: number): string => STAGE_CSS_COLORS[level] ?? STAGE_CSS_COLORS[0];

/** The same colours for canvas charts, which cannot read CSS variables. */
export function stageChartColor(level: number, palette: ChartPalette): string {
  return [palette.textMuted, palette.success, palette.series[0], palette.warning, palette.danger][level] ?? palette.textMuted;
}

export const LIKELIHOOD_LABEL: Record<QeLikelihoodLevel, string> = { LOW: '低', MEDIUM: '中', HIGH: '高' };

/** In the radar a red light is a strong easing signal, not a warning. */
export const RADAR_STATUS_LABEL: Record<LiquidityStatus, string> = {
  GREEN: '无信号', YELLOW: '弱信号', RED: '强信号', NONE: '无数据',
};

export const DOC_TYPE_LABEL: Record<FedTextDocType, string> = {
  STATEMENT: 'FOMC 声明', IMPL_NOTE: '实施细则', MINUTES: '会议纪要', OTHER: '其他',
};

export const ALERT_TYPE_INFO: Record<QeAlertType, { icon: string; label: string }> = {
  STAGE_CHANGE: { icon: '🪜', label: '阶段变化' },
  LIKELIHOOD_CHANGE: { icon: '📊', label: '可能性变化' },
  TEXT_HIT: { icon: '📄', label: '文本命中' },
};

/** Text categories (design §3.3) with the ladder level each one points at; null = no level. */
const CATEGORY_INFO: Record<string, { label: string; level: number | null }> = {
  QE_PURCHASE: { label: '购买长债/MBS', level: 4 },
  EMERGENCY: { label: '紧急工具', level: 3 },
  RMP: { label: '储备管理购买', level: 2 },
  QT_END: { label: '缩表放缓/结束', level: 1 },
  QT: { label: '缩表', level: 0 },
  TAPER: { label: '放缓购买', level: null },
  CUT: { label: '降息', level: null },
  HIKE: { label: '加息', level: null },
  DISSENT_EASE: { label: '异议：倾向降息', level: null },
  DISSENT_TIGHTEN: { label: '异议：倾向加息', level: null },
};

export function categoryInfo(category: string): { label: string; level: number | null } {
  return CATEGORY_INFO[category] ?? { label: category, level: null };
}

/** Leading indicators first: the earlier the weak signal, the higher the row; indicators that never fired go last. */
export function sortLeads(leads: QeReplayLead[]): QeReplayLead[] {
  const days = (v: number | null) => v ?? Number.NEGATIVE_INFINITY;
  return [...leads].sort((a, b) =>
    days(b.leadDaysYellow) - days(a.leadDaysYellow) || days(b.leadDaysRed) - days(a.leadDaysRed) || a.code.localeCompare(b.code));
}

export function formatLeadDays(days: number | null | undefined): string {
  if (days == null) return '—';
  return days === 0 ? '当天' : `${days} 天`;
}

/** Points for the step chart: both ends of each segment, so the level holds until the next segment starts. */
export function stageStepPoints(segments: QeStageSegment[]): [string, number][] {
  return segments.flatMap((s): [string, number][] => (s.from === s.to ? [[s.from, s.level]] : [[s.from, s.level], [s.to, s.level]]));
}

/** "放水雷达：L1 中性 ｜ 升级可能性：中 ｜ 未读提醒 2 →" */
export function buildRadarSummary(view: Pick<QeRadarView, 'stage' | 'likelihood' | 'unreadAlerts'>): string {
  const parts = [
    `放水雷达：${stageLabel(view.stage.level, view.stage.name)}`,
    `升级可能性：${LIKELIHOOD_LABEL[view.likelihood.level]}`,
  ];
  if (view.unreadAlerts > 0) parts.push(`未读提醒 ${view.unreadAlerts}`);
  return `${parts.join(' ｜ ')} →`;
}

export interface TextSegment {
  text: string;
  hit: boolean;
}

/** Splits a document body so the matched sentences can be shown in bold; sentences not found verbatim are ignored. */
export function splitByHits(body: string, sentences: string[]): TextSegment[] {
  const ranges: [number, number][] = [];
  for (const sentence of new Set(sentences)) {
    if (!sentence) continue;
    const start = body.indexOf(sentence);
    if (start >= 0) ranges.push([start, start + sentence.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue; // overlaps a sentence that is already marked
    if (start > cursor) segments.push({ text: body.slice(cursor, start), hit: false });
    segments.push({ text: body.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < body.length) segments.push({ text: body.slice(cursor), hit: false });
  return segments;
}
