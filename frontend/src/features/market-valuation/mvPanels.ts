import type { MvCatalogEntry, MvSeriesResponse, MvWindow } from '../../api';
import type { ChartMarkLine, ChartSeries } from '../liquidity/charts/TimeSeriesChart';
import { windowLabel } from './mvUtils';

interface PanelSeriesDef {
  code: string;
  axis?: 0 | 1;
  type?: 'line' | 'bar';
  step?: boolean;
  /** Daily series: left out (and not fetched) on ranges longer than 20 years, where the monthly series says it all. */
  dailyOnly?: boolean;
  /** Only drawn when the code exists in the catalog (manual series the user may not have created). */
  optional?: boolean;
}

export interface PanelDef {
  id: string;
  title: string;
  note?: string;
  series: PanelSeriesDef[];
  /** Series whose window statistics (mean, ±1σ band, p90) are overlaid. */
  statsCode?: string;
  markLines?: ChartMarkLine[];
}

const ZERO_LINE: ChartMarkLine = { axis: 0, value: 0, label: '0', tone: 'muted' };

/** Presets of the valuation trend tab (design §6.4). */
export const VALUATION_PANELS: PanelDef[] = [
  {
    id: 'cape',
    title: '席勒 CAPE',
    note: '日度值按最新价格外推（估算），月度为 multpl 原值；虚线为当前窗口均值与 p90，阴影为 μ ± 1σ。超过 20 年的范围只画月度。',
    series: [{ code: 'SPX_CAPE_D', dailyOnly: true }, { code: 'SPX_CAPE' }],
    statsCode: 'SPX_CAPE_D',
  },
  {
    id: 'buffett',
    title: '巴菲特指标（股市总市值 / GDP）',
    note: '季度值为官方口径（阶梯线），日度值由 Wilshire 5000 外推；Z.1 数据约滞后 10 周，历史回看含事后视角。需要 FRED Key。',
    series: [{ code: 'BUFFETT_D' }, { code: 'BUFFETT_Q', step: true }],
    statsCode: 'BUFFETT_D',
  },
  {
    id: 'pe',
    title: 'TTM PE 与远期 PE',
    note: 'TTM PE 为 multpl 报告口径的日度估算；远期 PE 来自 FactSet 每周报告（2017 年起），并附 5 / 10 年均值。',
    series: [{ code: 'SPX_PE_D' }, { code: 'FS_FWD_PE' }, { code: 'FS_FWD_PE_AVG5Y' }, { code: 'FS_FWD_PE_AVG10Y' }],
  },
  {
    id: 'ps-pb',
    title: '市销率 PS / 市净率 PB',
    note: 'PS 为左轴，PB 为右轴。回购压缩净资产，PB 在美股长期失真，仅供参考。',
    series: [{ code: 'SPX_PS_D' }, { code: 'SPX_PB_D', axis: 1 }],
  },
  {
    id: 'erp',
    title: '股权风险溢价 ERP',
    note: '实际 ERP = 1/CAPE − 10 年 TIPS 实际利率（主指标，越低越贵）；名义 ERP 与远期 ERP 作参照。需要 FRED Key。',
    series: [{ code: 'ERP_REAL_D' }, { code: 'ERP_NOM_D' }, { code: 'ERP_FWD' }],
    markLines: [ZERO_LINE],
  },
  {
    id: 'erp-parts',
    title: 'ERP 的组成：盈利收益率与利率',
    series: [{ code: 'SPX_CAPE_EY_D' }, { code: 'TIPS10Y' }, { code: 'UST10Y' }],
  },
  {
    id: 'tobin',
    title: '托宾 Q（非金融企业，季度）',
    note: '股权市值 / 净值，仅供参考。需要 FRED Key。',
    series: [{ code: 'TOBIN_Q', step: true }],
  },
  {
    id: 'structure',
    title: '结构与情绪',
    note: 'RSP/SPY 为左轴（下降说明“贵只贵在头部”），VIX 为右轴。',
    series: [{ code: 'RSP_SPY' }, { code: 'VIX', axis: 1 }],
  },
];

/** Presets of the profitability tab (design §6.6, items 1–4). */
export const PROFIT_PANELS: PanelDef[] = [
  {
    id: 'eps',
    title: 'EPS 与同比增速',
    note: '报告口径 TTM EPS（左轴）与同比增速（右轴，柱）；滞后约 1–2 个季度。',
    series: [{ code: 'SPX_EPS' }, { code: 'SPX_EPS_YOY', type: 'bar', axis: 1 }],
  },
  {
    id: 'margin',
    title: '利润率与 ROE',
    note: '净利率 = EPS / 每股销售额，ROE = EPS / 每股净资产（期末口径，回购会使其偏高）。',
    series: [{ code: 'SPX_NET_MARGIN' }, { code: 'SPX_ROE' }, { code: 'M_SPX_NET_MARGIN_FS', optional: true }],
  },
  {
    id: 'profit-gdp',
    title: '企业税后利润 / GDP',
    note: '需要 FRED Key。',
    series: [{ code: 'PROFIT_GDP' }],
  },
  {
    id: 'fs-growth',
    title: 'FactSet 每周：当季混合增速与下一年预期',
    note: '柱为当季 EPS / 营收同比（混合口径），线为下一自然年 EPS 增速预期。',
    series: [{ code: 'FS_EPS_G_Q', type: 'bar' }, { code: 'FS_REV_G_Q', type: 'bar' }, { code: 'FS_EPS_G_NY' }],
  },
  {
    id: 'fs-fwd-eps',
    title: 'FactSet 远期 EPS 与 13 周修正',
    note: '隐含远期 12 个月 EPS（左轴）与 13 周修正幅度（右轴，柱）。',
    series: [{ code: 'FS_FWD_EPS' }, { code: 'FS_FWD_EPS_CHG_13W', type: 'bar', axis: 1 }],
  },
];

/** The /series endpoint accepts at most 12 codes per request. */
const MAX_PER_REQUEST = 12;

const isDrawn = (s: PanelSeriesDef, catalog: Map<string, MvCatalogEntry>, longRange: boolean) =>
  !(s.dailyOnly && longRange) && !(s.optional && !catalog.has(s.code));

/** Every series code a panel needs from the backend. */
export function panelCodes(def: PanelDef, catalog: Map<string, MvCatalogEntry>, longRange: boolean): string[] {
  const codes = def.series.filter(s => isDrawn(s, catalog, longRange)).map(s => s.code);
  if (def.statsCode) codes.push(def.statsCode);
  return [...new Set(codes)].slice(0, MAX_PER_REQUEST);
}

const nameOf = (code: string, catalog: Map<string, MvCatalogEntry>) => catalog.get(code)?.name ?? code;
const unitOf = (code: string, catalog: Map<string, MvCatalogEntry>) => catalog.get(code)?.unit ?? '';

export interface BuiltPanel {
  series: ChartSeries[];
  markLines: ChartMarkLine[];
}

/** Series plus the window-statistics overlay: mean / p90 reference lines and a μ ± 1σ band (stacked helper series). */
export function buildPanel(
  def: PanelDef, data: MvSeriesResponse, catalog: Map<string, MvCatalogEntry>, longRange: boolean, window: MvWindow,
): BuiltPanel {
  const series: ChartSeries[] = [];
  const markLines: ChartMarkLine[] = [...(def.markLines ?? [])];

  const drawn = def.series
    .filter(s => isDrawn(s, catalog, longRange))
    .map(s => ({ def: s, points: data.series[s.code] ?? [] }))
    .filter(s => s.points.length > 0);

  const stats = def.statsCode ? data.stats?.[def.statsCode] : null;
  const dates = drawn.flatMap(s => [s.points[0][0], s.points[s.points.length - 1][0]]).sort();
  if (stats && dates.length > 0) {
    const edges = [dates[0], dates[dates.length - 1]];
    const unit = unitOf(def.statsCode ?? '', catalog);
    const name = `μ ± 1σ（${windowLabel(window)}窗口）`;
    series.push({ key: 'band-base', name: `${name}下沿`, unit, points: edges.map(d => [d, stats.mean - stats.sd]), axis: 0, stack: 'band', helper: true });
    series.push({ key: 'band-width', name, unit, points: edges.map(d => [d, 2 * stats.sd]), axis: 0, stack: 'band', area: true, helper: true });
    markLines.push({ axis: 0, value: stats.mean, label: `均值 ${stats.mean.toFixed(1)}`, tone: 'muted' });
    markLines.push({ axis: 0, value: stats.p90, label: `p90 ${stats.p90.toFixed(1)}`, tone: 'warning' });
  }

  for (const s of drawn) {
    series.push({
      key: s.def.code,
      name: nameOf(s.def.code, catalog),
      unit: unitOf(s.def.code, catalog),
      points: s.points,
      axis: s.def.axis ?? 0,
      type: s.def.type,
      step: s.def.step,
    });
  }
  return { series, markLines };
}

/** Series for the custom panel: the axes follow the units (assigned by the caller). */
export function buildCustomSeries(
  codes: string[], data: MvSeriesResponse['series'], catalog: Map<string, MvCatalogEntry>, axes: Record<string, 0 | 1>,
): ChartSeries[] {
  return codes.flatMap(code => {
    const points = data[code];
    if (!points || points.length === 0) return [];
    const unit = unitOf(code, catalog);
    return [{ key: code, name: nameOf(code, catalog), unit, points, axis: axes[unit] ?? 0 }];
  });
}
