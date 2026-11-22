import type { LiquidityCatalogEntry, LiquiditySeriesData } from '../../api';
import type { ChartMarkLine, ChartSeries } from './charts/TimeSeriesChart';
import { assignAxes } from './liquidityUtils';

interface PanelSeriesDef {
  code: string;
  axis?: 0 | 1;
  type?: 'line' | 'bar';
  step?: boolean;
  redAboveZero?: boolean;
  /** Series sharing a stack name are stacked on top of each other. */
  stack?: string;
  /** Filled area under the line. */
  area?: boolean;
}

export interface PanelDef {
  id: string;
  title: string;
  note?: string;
  series: PanelSeriesDef[];
  /** A shaded band between two series (drawn as a stacked transparent base + filled width). */
  band?: { lower: string; upper: string; name: string };
  markLines?: ChartMarkLine[];
  /** Append every manual series (the credit panel). */
  includeManual?: boolean;
}

/** The nine preset panels of the trend tab (design §6.4 and qe-radar §7.4). */
export const PANELS: PanelDef[] = [
  {
    id: 'corridor',
    title: '利率走廊',
    note: '政策利率（IORB、ON RRP、SRF、目标区间）为阶梯线；SOFR 越过 IORB 即触及走廊上沿。',
    series: [
      { code: 'SOFR' }, { code: 'TGCR' }, { code: 'EFFR' },
      { code: 'IORB', step: true }, { code: 'ONRRP_RATE', step: true }, { code: 'SRF_RATE', step: true },
      { code: 'FFTR_LOW', step: true }, { code: 'FFTR_HIGH', step: true },
    ],
  },
  {
    id: 'spreads',
    title: '核心利差（bp）',
    note: 'SOFR − IORB 高于 0（红色部分）意味着回购市场梗阻。',
    series: [{ code: 'SOFR_IORB', redAboveZero: true }, { code: 'TGCR_IORB' }, { code: 'SOFR_EFFR' }],
    markLines: [{ axis: 0, value: 0, label: '0', tone: 'muted' }],
  },
  {
    id: 'tail',
    title: '尾部压力',
    note: '阴影为 SOFR 1~99 分位带（左轴，%）；折线为 SOFR 99 分位 − IORB（右轴，bp）。',
    series: [{ code: 'SOFR99_IORB', axis: 1 }],
    band: { lower: 'SOFR_P1', upper: 'SOFR_P99', name: 'SOFR 1~99 分位带' },
    markLines: [{ axis: 1, value: 0, label: '0', tone: 'muted' }],
  },
  {
    id: 'stocks',
    title: '流动性存量（bn）',
    note: '准备金、ON RRP、TGA 为左轴；美联储总资产为右轴。',
    series: [
      { code: 'RESERVES' }, { code: 'ONRRP_AMT' }, { code: 'TGA' }, { code: 'FED_ASSETS', axis: 1 },
    ],
  },
  {
    id: 'ratio',
    title: '准备金比例（%）',
    note: '近似口径：(周均准备金 + 当周 ON RRP 均值) / 银行总资产。',
    series: [{ code: 'LIQ_RATIO' }],
    markLines: [
      { axis: 0, value: 11, label: '悬崖边缘 11%', tone: 'danger' },
      { axis: 0, value: 14, label: '2025 年紧张 14%', tone: 'warning' },
    ],
  },
  {
    id: 'facilities',
    title: '联储工具使用（bn）',
    series: [{ code: 'SRF_AMT', type: 'bar' }, { code: 'RMP_MONTHLY', type: 'bar' }],
  },
  {
    id: 'credit',
    title: '信用',
    note: '高收益债利差来自 FRED（只提供近几年历史）；手动序列（如 CDS）在设置页录入。',
    series: [{ code: 'HY_OAS' }],
    includeManual: true,
  },
  {
    id: 'soma',
    title: 'SOMA 结构（bn）',
    note: '美联储持有的短债、中长期国债、MBS/机构债（堆叠面积），折线为总持仓。短债增加而长债/MBS 减少是技术性扩表，长债/MBS 同时增加才是 QE。',
    series: [
      { code: 'SOMA_BILLS', stack: 'soma', area: true },
      { code: 'SOMA_COUPONS', stack: 'soma', area: true },
      { code: 'SOMA_MBS', stack: 'soma', area: true },
      { code: 'SOMA_TOTAL' },
    ],
  },
  {
    id: 'netliq',
    title: '净流动性（bn）',
    note: '净流动性 = 美联储总资产 − TGA − ON RRP（折线，左轴）；柱为 13 周变化（右轴）。TGA 下降带来的上升是财政放水，不是 QE。',
    series: [{ code: 'NET_LIQ' }, { code: 'NET_LIQ_13W', type: 'bar', axis: 1 }],
  },
];

/** The /series endpoint accepts at most 12 codes per request. */
const MAX_PER_REQUEST = 12;

/** Every series code a panel needs from the backend. */
export function panelCodes(def: PanelDef, manualCodes: string[]): string[] {
  const codes = def.series.map(s => s.code);
  if (def.band) codes.push(def.band.lower, def.band.upper);
  if (def.includeManual) codes.push(...manualCodes);
  return [...new Set(codes)].slice(0, MAX_PER_REQUEST);
}

const nameOf = (code: string, catalog: Map<string, LiquidityCatalogEntry>) => catalog.get(code)?.name ?? code;
const unitOf = (code: string, catalog: Map<string, LiquidityCatalogEntry>) => catalog.get(code)?.unit ?? '';

/** Upper minus lower on the dates where both exist. */
export function bandWidth(lower: [string, number][], upper: [string, number][]): [string, number][] {
  const lowerByDate = new Map(lower);
  const out: [string, number][] = [];
  for (const [date, value] of upper) {
    const base = lowerByDate.get(date);
    if (base != null) out.push([date, Math.round((value - base) * 1e6) / 1e6]);
  }
  return out;
}

export function buildPanelSeries(
  def: PanelDef, data: LiquiditySeriesData, catalog: Map<string, LiquidityCatalogEntry>, manualCodes: string[],
): ChartSeries[] {
  const out: ChartSeries[] = [];

  if (def.band) {
    const lower = data[def.band.lower] ?? [];
    const upper = data[def.band.upper] ?? [];
    out.push({ key: `${def.band.lower}-base`, name: `${def.band.name}（下沿）`, unit: '%', points: lower, axis: 0, stack: 'band', helper: true });
    out.push({ key: `${def.band.upper}-width`, name: def.band.name, unit: '%', points: bandWidth(lower, upper), axis: 0, stack: 'band', area: true });
  }

  const defs = [...def.series];
  if (def.includeManual) manualCodes.forEach(code => defs.push({ code }));
  // Axes are decided from the series that actually have data, so an empty series never forces a third unit.
  const withData = defs.filter(s => (data[s.code]?.length ?? 0) > 0);
  const autoAxes = def.includeManual ? assignAxes(withData.map(s => unitOf(s.code, catalog))) : null;

  for (const s of withData) {
    const unit = unitOf(s.code, catalog);
    out.push({
      key: s.code,
      name: nameOf(s.code, catalog),
      unit,
      points: data[s.code],
      axis: s.axis ?? autoAxes?.[unit] ?? 0,
      type: s.type,
      step: s.step,
      stack: s.stack,
      area: s.area,
      redAboveZero: s.redAboveZero,
    });
  }
  return out;
}

/** Series for the custom panel; the axes follow the units. Returns null when more than two units are selected. */
export function buildCustomSeries(
  codes: string[], data: LiquiditySeriesData, catalog: Map<string, LiquidityCatalogEntry>,
): ChartSeries[] | null {
  const axes = assignAxes(codes.map(c => unitOf(c, catalog)));
  if (!axes) return null;
  return codes.flatMap(code => {
    const points = data[code];
    if (!points || points.length === 0) return [];
    const unit = unitOf(code, catalog);
    return [{ key: code, name: nameOf(code, catalog), unit, points, axis: axes[unit] ?? 0 }];
  });
}
