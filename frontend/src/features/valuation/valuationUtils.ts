import type { ValuationSnapshot } from '../../api';

/** Editable part of a snapshot (what the form and the import send to the backend). */
export type SnapshotInput = Omit<ValuationSnapshot, 'id' | 'createdAt'>;

/** Numeric snapshot fields, in the order used by the export template. */
export const NUMERIC_FIELDS = [
  'pe', 'ps', 'ntmPe', 'ntmPs',
  'grossMargin', 'grossMarginQ1', 'grossMarginQ2', 'grossMarginQ3', 'grossMarginQ4',
  'netMargin', 'nonGaapNetMargin', 'netMarginQ1', 'netMarginQ2', 'netMarginQ3', 'netMarginQ4',
  'fcfMultiple', 'fwdFcfMultiple',
  'ttmRoicY1', 'ttmRoicY2', 'ttmRoicY3', 'ttmRoicY4',
] as const;

export type NumericField = typeof NUMERIC_FIELDS[number];

export interface MetricDef {
  key: keyof ValuationSnapshot;
  label: string;
  isPercent: boolean;
  lowIsBetter: boolean;
  computeValue?: (s: ValuationSnapshot) => number | null;
}

export function fmtNum(v: number | null | undefined, isPercent = false): string {
  if (v == null) return '—';
  return isPercent ? `${(v * 100).toFixed(1)}%` : v.toFixed(1);
}

function average(values: Array<number | null | undefined>): number | null {
  const vals = values.filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function avgGrossMargin(s: ValuationSnapshot): number | null {
  return average([s.grossMarginQ1, s.grossMarginQ2, s.grossMarginQ3, s.grossMarginQ4]);
}

export function avgNetIncome(s: ValuationSnapshot): number | null {
  return average([s.netMarginQ1, s.netMarginQ2, s.netMarginQ3, s.netMarginQ4]);
}

export const METRICS: MetricDef[] = [
  { key: 'pe',             label: 'PE',           isPercent: false, lowIsBetter: true  },
  { key: 'ps',             label: 'PS',           isPercent: false, lowIsBetter: true  },
  { key: 'ntmPe',          label: 'NTM PE',       isPercent: false, lowIsBetter: true  },
  { key: 'ntmPs',          label: 'NTM PS',       isPercent: false, lowIsBetter: true  },
  { key: 'fcfMultiple',    label: 'FCF Mul',      isPercent: false, lowIsBetter: true  },
  { key: 'fwdFcfMultiple', label: 'Fwd FCF Mul',  isPercent: false, lowIsBetter: true  },
  { key: 'grossMargin',    label: '毛利率',        isPercent: true,  lowIsBetter: false, computeValue: avgGrossMargin },
  { key: 'nonGaapNetMargin', label: 'NG 净利率', isPercent: true, lowIsBetter: false },
  { key: 'ttmRoicY4',      label: 'TTM ROIC',     isPercent: true,  lowIsBetter: false },
];

export function metricValue(s: ValuationSnapshot, m: MetricDef): number | null {
  return m.computeValue ? m.computeValue(s) : (s[m.key] as number | null | undefined) ?? null;
}

/** Best value of a metric across compared snapshots; only highlighted when comparing ≥ 2. */
export function bestMetricValue(snapshots: ValuationSnapshot[], m: MetricDef): number | null {
  const vals = snapshots.map(s => metricValue(s, m)).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  return m.lowIsBetter ? Math.min(...vals) : Math.max(...vals);
}

export function emptyForm(today = new Date().toISOString().slice(0, 10)): SnapshotInput {
  const form: SnapshotInput = { ticker: '', companyName: '', snapshotDate: today, notes: '' };
  for (const f of NUMERIC_FIELDS) form[f] = undefined;
  return form;
}

export function formFromSnapshot(s: ValuationSnapshot): SnapshotInput {
  const form: SnapshotInput = { ticker: s.ticker, companyName: s.companyName, snapshotDate: s.snapshotDate, notes: s.notes ?? '' };
  for (const f of NUMERIC_FIELDS) form[f] = s[f];
  return form;
}

// ── Search / filter / sort ───────────────────────────────────────────────

export function searchSnapshots(snapshots: ValuationSnapshot[], query: string): ValuationSnapshot[] {
  const q = query.trim().toLowerCase();
  if (!q) return snapshots;
  return snapshots.filter(s =>
    s.ticker.toLowerCase().includes(q) ||
    s.companyName.toLowerCase().includes(q) ||
    (s.notes ?? '').toLowerCase().includes(q));
}

export type FilterKey = 'pe' | 'ps' | 'ntmPe' | 'ntmPs' | 'fcfMultiple' | 'fwdFcfMultiple' | 'grossMargin' | 'nonGaapNetMargin' | 'avgMargin' | 'avgGrossMargin' | 'ttmRoicY4';
export type FilterOp = '>' | '<' | '>=' | '<=' | '=';
export interface FilterRule { id: number; key: FilterKey; op: FilterOp; value: string; }
export type FilterLogic = 'AND' | 'OR';

export const FILTER_KEYS: { key: FilterKey; label: string }[] = [
  { key: 'pe',               label: 'PE'               },
  { key: 'ps',               label: 'PS'               },
  { key: 'ntmPe',            label: 'NTM PE'           },
  { key: 'ntmPs',            label: 'NTM PS'           },
  { key: 'fcfMultiple',      label: 'FCF Mul'          },
  { key: 'fwdFcfMultiple',   label: 'Fwd FCF Mul'      },
  { key: 'grossMargin',      label: '毛利率 %'         },
  { key: 'avgGrossMargin',   label: '毛利率(季均) %'   },
  { key: 'nonGaapNetMargin', label: 'NG 净利率 %' },
  { key: 'avgMargin',        label: '净利率(季均) %'   },
  { key: 'ttmRoicY4',        label: 'TTM ROIC %'       },
];

const PERCENT_FILTER_KEYS = new Set<FilterKey>(['grossMargin', 'nonGaapNetMargin', 'ttmRoicY4']);

/** Value compared by a filter rule. Margins are stored as decimals (0.786) but filtered as percentages (78.6). */
export function filterValue(s: ValuationSnapshot, key: FilterKey): number | null {
  if (key === 'avgMargin') { const v = avgNetIncome(s); return v != null ? v * 100 : null; }
  if (key === 'avgGrossMargin') { const v = avgGrossMargin(s); return v != null ? v * 100 : null; }
  const v = s[key] ?? null;
  if (v == null) return null;
  return PERCENT_FILTER_KEYS.has(key) ? v * 100 : v;
}

/** Rules with an empty / non-numeric value, or snapshots missing the field, always pass. */
export function matchesRule(s: ValuationSnapshot, rule: Pick<FilterRule, 'key' | 'op' | 'value'>): boolean {
  const v = filterValue(s, rule.key);
  const t = parseFloat(rule.value);
  if (v == null || isNaN(t)) return true;
  switch (rule.op) {
    case '>': return v > t;
    case '<': return v < t;
    case '>=': return v >= t;
    case '<=': return v <= t;
    default: return Math.abs(v - t) < 0.0001;
  }
}

export function applyFilterRules(snapshots: ValuationSnapshot[], rules: FilterRule[], logic: FilterLogic): ValuationSnapshot[] {
  const active = rules.filter(r => r.value.trim() !== '');
  if (active.length === 0) return snapshots;
  return snapshots.filter(s =>
    logic === 'AND' ? active.every(r => matchesRule(s, r)) : active.some(r => matchesRule(s, r)));
}

export type SortKey = 'snapshotDate' | 'pe' | 'ps' | 'ntmPe' | 'ntmPs' | 'fcfMultiple' | 'fwdFcfMultiple' | 'grossMargin' | 'nonGaapNetMargin' | 'avgMargin' | 'avgGrossMargin' | 'ttmRoicY4';
export type SortDir = 'asc' | 'desc';

function sortValue(s: ValuationSnapshot, key: SortKey): number | null {
  if (key === 'avgMargin') return avgNetIncome(s);
  if (key === 'avgGrossMargin') return avgGrossMargin(s);
  if (key === 'snapshotDate') return s.snapshotDate ? new Date(s.snapshotDate).getTime() : null;
  return s[key] ?? null;
}

/** Sorts a copy; missing values always go last regardless of direction. */
export function sortSnapshots(snapshots: ValuationSnapshot[], key: SortKey | null, dir: SortDir): ValuationSnapshot[] {
  if (!key) return snapshots;
  return [...snapshots].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return dir === 'asc' ? av - bv : bv - av;
  });
}

/** Column header click cycles: ascending → descending → unsorted. */
export function nextSort(current: { key: SortKey | null; dir: SortDir }, clicked: SortKey): { key: SortKey | null; dir: SortDir } {
  if (current.key !== clicked) return { key: clicked, dir: 'asc' };
  if (current.dir === 'asc') return { key: clicked, dir: 'desc' };
  return { key: null, dir: 'asc' };
}

export function latestByTicker(snapshots: ValuationSnapshot[]): Record<string, ValuationSnapshot> {
  const latest: Record<string, ValuationSnapshot> = {};
  for (const s of snapshots) {
    const cur = latest[s.ticker];
    if (!cur || s.snapshotDate > cur.snapshotDate) latest[s.ticker] = s;
  }
  return latest;
}

// ── JSON import / export ────────────────────────────────────────────────

export type ImportMode = 'add' | 'update';
type RawItem = Record<string, unknown>;

/** Parses and validates the pasted JSON (single object or array). */
export function parseImportJson(json: string, mode: ImportMode): { items: RawItem[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json.trim());
  } catch {
    return { error: 'JSON 格式错误，请检查语法' };
  }
  const items = (Array.isArray(parsed) ? parsed : [parsed]) as RawItem[];
  if (items.length === 0) return { error: '数组为空，请至少提供一条记录' };
  for (let i = 0; i < items.length; i++) {
    const it = items[i] ?? {};
    if (!it.ticker || typeof it.ticker !== 'string') return { error: `第 ${i + 1} 条：缺少 ticker 字段` };
    if (!it.companyName || typeof it.companyName !== 'string') return { error: `第 ${i + 1} 条：缺少 companyName 字段` };
    if (mode === 'add' && (!it.snapshotDate || typeof it.snapshotDate !== 'string')) {
      return { error: `第 ${i + 1} 条：新增模式下缺少 snapshotDate 字段（格式 YYYY-MM-DD）` };
    }
  }
  return { items };
}

function toNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

/** Margin fields are stored as-is (decimal form, e.g. 0.786 = 78.6%); the display layer multiplies by 100. */
export function importItemToInput(it: RawItem, today: string): SnapshotInput {
  const input: SnapshotInput = {
    ticker: String(it.ticker).toUpperCase(),
    companyName: String(it.companyName),
    snapshotDate: it.snapshotDate ? String(it.snapshotDate) : today,
    notes: it.notes != null ? String(it.notes) : '',
  };
  for (const f of NUMERIC_FIELDS) input[f] = toNum(it[f]);
  return input;
}

/** Update mode: fields that are null/missing in the JSON keep the existing snapshot's value. */
export function mergeImportIntoExisting(it: RawItem, existing: ValuationSnapshot, today: string): SnapshotInput {
  const input = importItemToInput(it, today);
  for (const f of NUMERIC_FIELDS) {
    if (it[f] == null) input[f] = existing[f] ?? undefined;
  }
  input.notes = it.notes != null && String(it.notes) !== '' ? String(it.notes) : existing.notes ?? '';
  return input;
}

/** Blank import template with one entry per known company. */
export function buildImportTemplate(companies: { ticker: string; companyName: string }[]) {
  return companies.map(c => {
    const row: Record<string, unknown> = { ticker: c.ticker, companyName: c.companyName };
    for (const f of NUMERIC_FIELDS) row[f] = null;
    row.notes = '';
    return row;
  });
}
