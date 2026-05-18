import { useState, useEffect, useRef } from 'react';
import {
  getValuationSnapshots,
  getValuationCompanies,
  createValuationSnapshot,
  updateValuationSnapshot,
  deleteValuationSnapshot,
  type ValuationSnapshot,
  type ValuationCompany,
} from './api';

// ── Types ─────────────────────────────────────────────────────────────────

type TabId = 'list' | 'compare';

interface MetricDef {
  key: keyof ValuationSnapshot;
  label: string;
  isPercent: boolean;
  lowIsBetter: boolean;
  computeValue?: (s: ValuationSnapshot) => number | null;
}

const METRICS: MetricDef[] = [
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

function fmtNum(v: number | null | undefined, isPercent = false): string {
  if (v == null) return '—';
  return isPercent ? `${(v * 100).toFixed(1)}%` : v.toFixed(1);
}

function avgGrossMargin(s: ValuationSnapshot): number | null {
  const vals = [s.grossMarginQ1, s.grossMarginQ2, s.grossMarginQ3, s.grossMarginQ4]
    .filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function avgNetIncome(s: ValuationSnapshot): number | null {
  const vals = [s.netMarginQ1, s.netMarginQ2, s.netMarginQ3, s.netMarginQ4]
    .filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function emptyForm(): Omit<ValuationSnapshot, 'id' | 'createdAt'> {
  return {
    ticker: '',
    companyName: '',
    snapshotDate: new Date().toISOString().slice(0, 10),
    pe: undefined,
    ps: undefined,
    ntmPe: undefined,
    ntmPs: undefined,
    fcfMultiple: undefined,
    fwdFcfMultiple: undefined,
    grossMargin: undefined,
    grossMarginQ1: undefined,
    grossMarginQ2: undefined,
    grossMarginQ3: undefined,
    grossMarginQ4: undefined,
    netMargin: undefined,
    nonGaapNetMargin: undefined,
    netMarginQ1: undefined,
    netMarginQ2: undefined,
    netMarginQ3: undefined,
    netMarginQ4: undefined,
    ttmRoicY1: undefined,
    ttmRoicY2: undefined,
    ttmRoicY3: undefined,
    ttmRoicY4: undefined,
    notes: '',
  };
}

interface Props {
  onGoHome: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ValuationModule({ onGoHome }: Props) {
  const [darkMode, setDarkMode] = useState(document.documentElement.getAttribute('data-theme') === 'dark');
  const [tab, setTab] = useState<TabId>('list');
  const [snapshots, setSnapshots] = useState<ValuationSnapshot[]>([]);
  const [companies, setCompanies] = useState<ValuationCompany[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [compareSearch, setCompareSearch] = useState('');
  const [compareSelected, setCompareSelected] = useState<string[]>([]);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<ValuationSnapshot, 'id' | 'createdAt'>>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Detail state
  const [detailSnapshot, setDetailSnapshot] = useState<ValuationSnapshot | null>(null);

  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<'add' | 'update'>('add');

  // FMP Fetch state — removed

  // Tooltip state
  type TipLine = { label: string; value: string };
  const [avgTip, setAvgTip] = useState<{ lines: TipLine[]; x: number; y: number; above: boolean } | null>(null);
  function openTip(e: React.MouseEvent<HTMLElement>, lines: TipLine[]) {
    const r = e.currentTarget.getBoundingClientRect();
    const above = r.bottom > window.innerHeight * 0.55;
    setAvgTip({ lines, x: r.right + 8, y: above ? r.top : r.bottom + 4, above });
  }
  function closeTip() { setAvgTip(null); }

  type SortKey = 'snapshotDate' | 'pe' | 'ps' | 'ntmPe' | 'ntmPs' | 'fcfMultiple' | 'fwdFcfMultiple' | 'grossMargin' | 'nonGaapNetMargin' | 'avgMargin' | 'avgGrossMargin' | 'ttmRoicY4';
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Filter state
  type FilterKey = 'pe' | 'ps' | 'ntmPe' | 'ntmPs' | 'fcfMultiple' | 'fwdFcfMultiple' | 'grossMargin' | 'nonGaapNetMargin' | 'avgMargin' | 'avgGrossMargin' | 'ttmRoicY4';
  type FilterOp = '>' | '<' | '>=' | '<=' | '=';
  interface FilterRule { id: number; key: FilterKey; op: FilterOp; value: string; }
  const FILTER_KEYS: { key: FilterKey; label: string }[] = [
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
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND');
  const filterIdRef = useRef(0);

  function addFilter() {
    filterIdRef.current += 1;
    setFilters(fs => [...fs, { id: filterIdRef.current, key: 'pe', op: '<=', value: '' }]);
  }
  function removeFilter(id: number) {
    setFilters(fs => fs.filter(f => f.id !== id));
  }
  function updateFilter(id: number, patch: Partial<FilterRule>) {
    setFilters(fs => fs.map(f => f.id === id ? { ...f, ...patch } as FilterRule : f));
  }

  function handleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      // third click: clear sort
      setSortKey(null);
      setSortDir('asc');
    }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span className="val-sort-icon">⇅</span>;
    return <span className="val-sort-icon active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  // ── Dark mode sync ──────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // ── Data loading ────────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [snapRes, compRes] = await Promise.all([
      getValuationSnapshots(),
      getValuationCompanies(),
    ]);
    setSnapshots(snapRes.data);
    setCompanies(compRes.data);
  }

  // ── Derived data ────────────────────────────────────────────────────────

  const q = searchQuery.trim().toLowerCase();
  const baseFiltered = q
    ? snapshots.filter(s =>
        s.ticker.toLowerCase().includes(q) ||
        s.companyName.toLowerCase().includes(q) ||
        (s.notes ?? '').toLowerCase().includes(q)
      )
    : snapshots;

  // Apply filter rules
  function getFilterVal(s: ValuationSnapshot, key: string): number | null {
    // Margin fields are stored as decimals (0.786); multiply by 100 so filter values work as percentages (78.6)
    if (key === 'avgMargin') { const v = avgNetIncome(s); return v != null ? v * 100 : null; }
    if (key === 'avgGrossMargin') { const v = avgGrossMargin(s); return v != null ? v * 100 : null; }
    if (key === 'grossMargin' || key === 'nonGaapNetMargin') {
      const v = (s[key as keyof ValuationSnapshot] as number | null | undefined) ?? null;
      return v != null ? v * 100 : null;
    }
    if (key === 'ttmRoicY4') {
      const v = (s.ttmRoicY4 as number | null | undefined) ?? null;
      return v != null ? v * 100 : null;
    }
    return (s[key as keyof ValuationSnapshot] as number | null | undefined) ?? null;
  }
  function testFilter(s: ValuationSnapshot, f: { key: string; op: string; value: string }): boolean {
    const v = getFilterVal(s, f.key);
    const t = parseFloat(f.value);
    if (v == null || isNaN(t)) return true;
    if (f.op === '>')  return v > t;
    if (f.op === '<')  return v < t;
    if (f.op === '>=') return v >= t;
    if (f.op === '<=') return v <= t;
    return Math.abs(v - t) < 0.0001;
  }
  const activeFilters = filters.filter(f => f.value.trim() !== '');
  const afterFilter = activeFilters.length === 0
    ? baseFiltered
    : baseFiltered.filter(s =>
        filterLogic === 'AND'
          ? activeFilters.every(f => testFilter(s, f))
          : activeFilters.some(f => testFilter(s, f))
      );

  const filteredSnapshots = sortKey
    ? [...afterFilter].sort((a, b) => {
        let av: number | null | undefined;
        let bv: number | null | undefined;
        if (sortKey === 'avgMargin') {
          av = avgNetIncome(a);
          bv = avgNetIncome(b);
        } else if (sortKey === 'avgGrossMargin') {
          av = avgGrossMargin(a);
          bv = avgGrossMargin(b);
        } else if (sortKey === 'snapshotDate') {
          av = a.snapshotDate ? new Date(a.snapshotDate).getTime() : null;
          bv = b.snapshotDate ? new Date(b.snapshotDate).getTime() : null;
        } else {
          av = a[sortKey] as number | null | undefined;
          bv = b[sortKey] as number | null | undefined;
        }
        // nulls last
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return sortDir === 'asc' ? av - bv : bv - av;
      })
    : afterFilter;

  const cq = compareSearch.trim().toLowerCase();
  const filteredCompanies = cq
    ? companies.filter(c =>
        c.ticker.toLowerCase().includes(cq) ||
        c.companyName.toLowerCase().includes(cq)
      )
    : companies;

  // Latest snapshot per ticker (for comparison view)
  const latestByTicker: Record<string, ValuationSnapshot> = {};
  snapshots.forEach(s => {
    const cur = latestByTicker[s.ticker];
    if (!cur || s.snapshotDate > cur.snapshotDate) {
      latestByTicker[s.ticker] = s;
    }
  });

  const compareSnapshots = compareSelected
    .map(t => latestByTicker[t])
    .filter((s): s is ValuationSnapshot => s != null);

  // ── Handlers ────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(s: ValuationSnapshot) {
    setEditingId(s.id);
    setForm({
      ticker: s.ticker,
      companyName: s.companyName,
      snapshotDate: s.snapshotDate,
      pe: s.pe,
      ps: s.ps,
      ntmPe: s.ntmPe,
      ntmPs: s.ntmPs,
      fcfMultiple: s.fcfMultiple,
      fwdFcfMultiple: s.fwdFcfMultiple,
      grossMargin: s.grossMargin,
      grossMarginQ1: s.grossMarginQ1,
      grossMarginQ2: s.grossMarginQ2,
      grossMarginQ3: s.grossMarginQ3,
      grossMarginQ4: s.grossMarginQ4,
      netMargin: s.netMargin,
      nonGaapNetMargin: s.nonGaapNetMargin,
      netMarginQ1: s.netMarginQ1,
      netMarginQ2: s.netMarginQ2,
      netMarginQ3: s.netMarginQ3,
      netMarginQ4: s.netMarginQ4,
      ttmRoicY1: s.ttmRoicY1,
      ttmRoicY2: s.ttmRoicY2,
      ttmRoicY3: s.ttmRoicY3,
      ttmRoicY4: s.ttmRoicY4,
      notes: s.notes ?? '',
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
  }

  function openImport() {
    setImportJson('');
    setImportError(null);
    setImportMode('add');
    setImportOpen(true);
  }

  function closeImport() {
    setImportOpen(false);
    setImportError(null);
  }

  async function handleImport() {
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJson.trim());
    } catch {
      setImportError('JSON 格式错误，请检查语法');
      return;
    }
    const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    if (items.length === 0) {
      setImportError('数组为空，请至少提供一条记录');
      return;
    }
    // Validate required fields
    for (let i = 0; i < items.length; i++) {
      const it = items[i] as Record<string, unknown>;
      if (!it.ticker || typeof it.ticker !== 'string') {
        setImportError(`第 ${i + 1} 条：缺少 ticker 字段`);
        return;
      }
      if (!it.companyName || typeof it.companyName !== 'string') {
        setImportError(`第 ${i + 1} 条：缺少 companyName 字段`);
        return;
      }
      if (importMode === 'add' && (!it.snapshotDate || typeof it.snapshotDate !== 'string')) {
        setImportError(`第 ${i + 1} 条：新增模式下缺少 snapshotDate 字段（格式 YYYY-MM-DD）`);
        return;
      }
    }
    setImporting(true);
    const today = new Date().toISOString().slice(0, 10);
    // Margin fields are stored as-is (decimal form, e.g. 0.786 = 78.6%); display layer multiplies by 100
    function toNum(v: unknown): number | undefined {
      if (v == null) return undefined;
      const n = Number(v);
      return isNaN(n) ? undefined : n;
    }
    try {
      for (const it of items as Record<string, unknown>[]) {
        const ticker = String(it.ticker).toUpperCase();
        const payload = {
          ticker,
          companyName: String(it.companyName),
          snapshotDate: it.snapshotDate ? String(it.snapshotDate) : today,
          pe: toNum(it.pe),
          ps: toNum(it.ps),
          ntmPe: toNum(it.ntmPe),
          ntmPs: toNum(it.ntmPs),
          fcfMultiple: toNum(it.fcfMultiple),
          fwdFcfMultiple: toNum(it.fwdFcfMultiple),
          grossMargin: toNum(it.grossMargin),
          grossMarginQ1: toNum(it.grossMarginQ1),
          grossMarginQ2: toNum(it.grossMarginQ2),
          grossMarginQ3: toNum(it.grossMarginQ3),
          grossMarginQ4: toNum(it.grossMarginQ4),
          netMargin: toNum(it.netMargin),
          nonGaapNetMargin: toNum(it.nonGaapNetMargin),
          netMarginQ1: toNum(it.netMarginQ1),
          netMarginQ2: toNum(it.netMarginQ2),
          netMarginQ3: toNum(it.netMarginQ3),
          netMarginQ4: toNum(it.netMarginQ4),
          ttmRoicY1: toNum(it.ttmRoicY1),
          ttmRoicY2: toNum(it.ttmRoicY2),
          ttmRoicY3: toNum(it.ttmRoicY3),
          ttmRoicY4: toNum(it.ttmRoicY4),
          notes: it.notes != null ? String(it.notes) : '',
        };

        if (importMode === 'update') {
          const existing = latestByTicker[ticker];
          if (existing) {
            // Merge: null fields in JSON keep the existing value
            await updateValuationSnapshot(existing.id, {
              ...payload,
              snapshotDate: it.snapshotDate ? String(it.snapshotDate) : today,
              pe:               it.pe               != null ? toNum(it.pe)!               : existing.pe               ?? undefined,
              ps:               it.ps               != null ? toNum(it.ps)!               : existing.ps               ?? undefined,
              ntmPe:            it.ntmPe             != null ? toNum(it.ntmPe)!            : existing.ntmPe             ?? undefined,
              ntmPs:            it.ntmPs             != null ? toNum(it.ntmPs)!            : existing.ntmPs             ?? undefined,
              fcfMultiple:      it.fcfMultiple       != null ? toNum(it.fcfMultiple)!      : existing.fcfMultiple       ?? undefined,
              fwdFcfMultiple:   it.fwdFcfMultiple    != null ? toNum(it.fwdFcfMultiple)!   : existing.fwdFcfMultiple    ?? undefined,
              grossMargin:      it.grossMargin       != null ? toNum(it.grossMargin)!      : existing.grossMargin       ?? undefined,
              grossMarginQ1:    it.grossMarginQ1     != null ? toNum(it.grossMarginQ1)!    : existing.grossMarginQ1     ?? undefined,
              grossMarginQ2:    it.grossMarginQ2     != null ? toNum(it.grossMarginQ2)!    : existing.grossMarginQ2     ?? undefined,
              grossMarginQ3:    it.grossMarginQ3     != null ? toNum(it.grossMarginQ3)!    : existing.grossMarginQ3     ?? undefined,
              grossMarginQ4:    it.grossMarginQ4     != null ? toNum(it.grossMarginQ4)!    : existing.grossMarginQ4     ?? undefined,
              netMargin:        it.netMargin         != null ? toNum(it.netMargin)!        : existing.netMargin         ?? undefined,
              nonGaapNetMargin: it.nonGaapNetMargin  != null ? toNum(it.nonGaapNetMargin)! : existing.nonGaapNetMargin  ?? undefined,
              netMarginQ1:      it.netMarginQ1       != null ? toNum(it.netMarginQ1)!      : existing.netMarginQ1       ?? undefined,
              netMarginQ2:      it.netMarginQ2       != null ? toNum(it.netMarginQ2)!      : existing.netMarginQ2       ?? undefined,
              netMarginQ3:      it.netMarginQ3       != null ? toNum(it.netMarginQ3)!      : existing.netMarginQ3       ?? undefined,
              netMarginQ4:      it.netMarginQ4       != null ? toNum(it.netMarginQ4)!      : existing.netMarginQ4       ?? undefined,
              ttmRoicY1:        it.ttmRoicY1         != null ? toNum(it.ttmRoicY1)!        : existing.ttmRoicY1         ?? undefined,
              ttmRoicY2:        it.ttmRoicY2         != null ? toNum(it.ttmRoicY2)!        : existing.ttmRoicY2         ?? undefined,
              ttmRoicY3:        it.ttmRoicY3         != null ? toNum(it.ttmRoicY3)!        : existing.ttmRoicY3         ?? undefined,
              ttmRoicY4:        it.ttmRoicY4         != null ? toNum(it.ttmRoicY4)!        : existing.ttmRoicY4         ?? undefined,
              notes: it.notes != null && String(it.notes) !== '' ? String(it.notes) : existing.notes ?? '',
            });
          } else {
            // Ticker not found — fall back to create
            await createValuationSnapshot(payload);
          }
        } else {
          await createValuationSnapshot(payload);
        }
      }
      closeImport();
      await loadData();
    } catch {
      setImportError('导入失败，请检查数据后重试');
    } finally {
      setImporting(false);
    }
  }

  async function handleSave() {
    const ticker = form.ticker.trim().toUpperCase();
    const companyName = form.companyName.trim();
    if (!ticker || !companyName || !form.snapshotDate) {
      alert('请填写股票代码、公司名称和快照日期');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, ticker, companyName };
      if (editingId != null) {
        await updateValuationSnapshot(editingId, payload);
      } else {
        await createValuationSnapshot(payload);
      }
      closeForm();
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, onDone?: () => void) {
    if (!confirm('确定删除这条快照记录？')) return;
    await deleteValuationSnapshot(id);
    await loadData();
    onDone?.();
  }

  function toggleCompare(ticker: string) {
    setCompareSelected(prev =>
      prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]
    );
  }

  // Highlight the best value in a column across compared companies
  function getBestValue(m: MetricDef): number | null {
    const vals = compareSnapshots
      .map(s => m.computeValue ? m.computeValue(s) : (s[m.key] as number | null | undefined) ?? null)
      .filter((v): v is number => v != null);
    if (vals.length < 2) return null; // only highlight when comparing ≥2
    return m.lowIsBetter ? Math.min(...vals) : Math.max(...vals);
  }

  // Number field helper
  function numChange(key: keyof Omit<ValuationSnapshot, 'id' | 'ticker' | 'companyName' | 'snapshotDate' | 'notes' | 'createdAt'>) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setForm(prev => ({ ...prev, [key]: v === '' ? undefined : parseFloat(v) }));
    };
  }

  function numValue(key: keyof ValuationSnapshot): string {
    const v = form[key as keyof typeof form];
    if (v == null || v === '') return '';
    return String(v);
  }

  // ── Render ─────────────────────────────────────────────────────────

  function handleExportTemplate() {
    const today = new Date().toISOString().slice(0, 10);
    const template = companies.map(c => ({
      ticker: c.ticker,
      companyName: c.companyName,
      pe: null,
      ps: null,
      ntmPe: null,
      ntmPs: null,
      grossMargin: null,
      grossMarginQ1: null,
      grossMarginQ2: null,
      grossMarginQ3: null,
      grossMarginQ4: null,
      netMargin: null,
      nonGaapNetMargin: null,
      netMarginQ1: null,
      netMarginQ2: null,
      netMarginQ3: null,
      netMarginQ4: null,
      fcfMultiple: null,
      fwdFcfMultiple: null,
      ttmRoicY1: null,
      ttmRoicY2: null,
      ttmRoicY3: null,
      ttmRoicY4: null,
      notes: ''
    }));
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `valuation-template-${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome} title="返回主页">⌂</button>
          <h1 className="app-title">估值比较</h1>
        </div>
        <div className="header-right">
          <button className="val-import-btn" onClick={openImport}>↑ 导入 JSON</button>
          <button className="val-import-btn" onClick={handleExportTemplate} title="导出包含所有公司的空白模板，填入最新数据后再导入">↓ 导出模板</button>
          <button className="confirm-btn" onClick={openAdd}>+ 添加快照</button>
          <button className="icon-btn" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? 'LITE' : 'TERM'}
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="val-tab-bar">
        <button
          className={`val-tab-btn${tab === 'list' ? ' active' : ''}`}
          onClick={() => setTab('list')}
        >
          快照记录
        </button>
        <button
          className={`val-tab-btn${tab === 'compare' ? ' active' : ''}`}
          onClick={() => setTab('compare')}
        >
          对比分析
        </button>
      </div>

      {/* Body */}
      <div className="val-body">

        {/* ── 快照记录 tab ─────────────────────────────────────────────── */}
        {tab === 'list' && (
          <>
            {/* Search bar */}
            <div className="val-search-bar">
              <span className="val-search-icon">⌕</span>
              <input
                className="val-search-input"
                placeholder="搜索股票代码、公司名称或备注…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="val-search-clear" onClick={() => setSearchQuery('')}>✕</button>
              )}
              <span className="val-search-count">
                {filteredSnapshots.length} / {snapshots.length} 条
              </span>
              <button className="val-filter-add-btn" onClick={addFilter}>⧹ 筛选</button>
            </div>

            {/* Filter rows */}
            {filters.length > 0 && (
              <div className="val-filter-bar">
                {filters.map((f, i) => (
                  <div key={f.id} className="val-filter-row">
                    {i === 0 ? (
                      <span className="val-filter-where">满足</span>
                    ) : (
                      <button
                        className="val-filter-logic-btn"
                        onClick={() => setFilterLogic(l => l === 'AND' ? 'OR' : 'AND')}
                      >{filterLogic}</button>
                    )}
                    <select
                      className="val-filter-select"
                      value={f.key}
                      onChange={e => updateFilter(f.id, { key: e.target.value as FilterRule['key'] })}
                    >
                      {FILTER_KEYS.map(k => (
                        <option key={k.key} value={k.key}>{k.label}</option>
                      ))}
                    </select>
                    <select
                      className="val-filter-select val-filter-op"
                      value={f.op}
                      onChange={e => updateFilter(f.id, { op: e.target.value as FilterRule['op'] })}
                    >
                      <option value="<">&lt;</option>
                      <option value="<=">&le;</option>
                      <option value="=">=</option>
                      <option value=">=">&ge;</option>
                      <option value=">">&gt;</option>
                    </select>
                    <input
                      className="val-filter-input"
                      type="number"
                      step="any"
                      placeholder="数字"
                      value={f.value}
                      onChange={e => updateFilter(f.id, { value: e.target.value })}
                    />
                    <button className="val-filter-remove" onClick={() => removeFilter(f.id)}>✕</button>
                  </div>
                ))}
                <button className="val-filter-clear" onClick={() => setFilters([])}>清除全部</button>
              </div>
            )}

            {/* Snapshot table */}
            <div className="val-table-wrap">
              <table className="val-table">
                <thead>
                  <tr>
                    <th className="val-th-sort" onClick={() => handleSort('snapshotDate')}>快照日期{sortIcon('snapshotDate')}</th>
                    <th>代码</th>
                    <th className="val-th-sort" onClick={() => handleSort('pe')}>PE{sortIcon('pe')}</th>
                    <th className="val-th-sort" onClick={() => handleSort('ps')}>PS{sortIcon('ps')}</th>
                    <th className="val-th-sort" onClick={() => handleSort('ntmPe')}>NTM PE{sortIcon('ntmPe')}</th>
                    <th className="val-th-sort" onClick={() => handleSort('ntmPs')}>NTM PS{sortIcon('ntmPs')}</th>
                    <th className="val-th-sort" onClick={() => handleSort('fcfMultiple')}>FCF Mul{sortIcon('fcfMultiple')}</th>
                    <th className="val-th-sort" onClick={() => handleSort('fwdFcfMultiple')}>Fwd FCF Mul{sortIcon('fwdFcfMultiple')}</th>
                    <th className="val-th-sort" onClick={() => handleSort('avgGrossMargin')}>毛利率(季均){sortIcon('avgGrossMargin')}</th>
                    <th className="val-th-sort" onClick={() => handleSort('nonGaapNetMargin')}>NG 净利率{sortIcon('nonGaapNetMargin')}</th>
                    <th className="val-th-sort" onClick={() => handleSort('avgMargin')}>净利率(季均){sortIcon('avgMargin')}</th>
                    <th className="val-th-sort" onClick={() => handleSort('ttmRoicY4')}>TTM ROIC{sortIcon('ttmRoicY4')}</th>
                    <th className="val-th-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSnapshots.length === 0 && (
                    <tr>
                      <td colSpan={13} className="val-empty">
                        {snapshots.length === 0
                          ? '暂无数据，点击右上角「+ 添加快照」开始记录'
                          : `没有匹配「${searchQuery}」的记录`}
                      </td>
                    </tr>
                  )}
                  {filteredSnapshots.map(s => (
                    <tr key={s.id} className="val-row val-row-clickable" onClick={() => setDetailSnapshot(s)}>
                      <td className="val-date">{s.snapshotDate}</td>
                      <td><strong>{s.ticker}</strong></td>
                      <td className="val-num">{fmtNum(s.pe)}</td>
                      <td className="val-num">{fmtNum(s.ps)}</td>
                      <td className="val-num">{fmtNum(s.ntmPe)}</td>
                      <td className="val-num">{fmtNum(s.ntmPs)}</td>
                      <td className="val-num">{fmtNum(s.fcfMultiple)}</td>
                      <td className="val-num">{fmtNum(s.fwdFcfMultiple)}</td>
                      <td className="val-num">
                        {(() => {
                          const avg = avgGrossMargin(s);
                          if (avg == null) return fmtNum(s.grossMargin, true);
                          return (
                            <span className="val-ni-avg"
                              onMouseEnter={e => openTip(e, [
                                { label: 'Q1 (最早)', value: fmtNum(s.grossMarginQ1, true) },
                                { label: 'Q2', value: fmtNum(s.grossMarginQ2, true) },
                                { label: 'Q3', value: fmtNum(s.grossMarginQ3, true) },
                                { label: 'Q4 (最新)', value: fmtNum(s.grossMarginQ4, true) },
                              ])}
                              onMouseLeave={closeTip}
                            >{fmtNum(avg, true)}</span>
                          );
                        })()}
                      </td>
                      <td className="val-num">{fmtNum(s.nonGaapNetMargin, true)}</td>
                      <td className="val-num">
                        {(() => {
                          const avg = avgNetIncome(s);
                          if (avg == null) return '—';
                          return (
                            <span className="val-ni-avg"
                              onMouseEnter={e => openTip(e, [
                                { label: 'Q1 (最早)', value: fmtNum(s.netMarginQ1, true) },
                                { label: 'Q2', value: fmtNum(s.netMarginQ2, true) },
                                { label: 'Q3', value: fmtNum(s.netMarginQ3, true) },
                                { label: 'Q4 (最新)', value: fmtNum(s.netMarginQ4, true) },
                              ])}
                              onMouseLeave={closeTip}
                            >{fmtNum(avg, true)}</span>
                          );
                        })()}
                      </td>
                      <td className="val-num">
                        {(() => {
                          const roic = s.ttmRoicY4;
                          const hasHistory = [s.ttmRoicY1, s.ttmRoicY2, s.ttmRoicY3].some(v => v != null);
                          if (roic == null) return '—';
                          if (!hasHistory) return fmtNum(roic, true);
                          return (
                            <span className="val-ni-avg"
                              onMouseEnter={e => openTip(e, [
                                { label: 'Y1 (最早)', value: fmtNum(s.ttmRoicY1, true) },
                                { label: 'Y2',        value: fmtNum(s.ttmRoicY2, true) },
                                { label: 'Y3',        value: fmtNum(s.ttmRoicY3, true) },
                                { label: 'Y4 (最新)', value: fmtNum(s.ttmRoicY4, true) },
                              ])}
                              onMouseLeave={closeTip}
                            >{fmtNum(roic, true)}</span>
                          );
                        })()}
                      </td>
                      <td className="val-td-actions" onClick={e => e.stopPropagation()}>
                        <div className="val-row-actions">
                          <button className="val-action-icon-btn" title="编辑" onClick={() => openEdit(s)}>✎</button>
                          <button className="val-action-icon-btn danger" title="删除" onClick={() => handleDelete(s.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── 对比分析 tab ─────────────────────────────────────────────── */}
        {tab === 'compare' && (
          <>
            <div className="val-compare-selector">
              <div className="val-compare-top">
                <span className="val-compare-label">选择公司（最新快照对比）：</span>
                {compareSelected.length > 0 && (
                  <button className="val-clear-btn" onClick={() => setCompareSelected([])}>清除选择</button>
                )}
              </div>
              <div className="val-compare-search-wrap">
                <span className="val-search-icon">⌕</span>
                <input
                  className="val-search-input val-compare-search-input"
                  placeholder="输入代码或公司名筛选…"
                  value={compareSearch}
                  onChange={e => setCompareSearch(e.target.value)}
                />
                {compareSearch && (
                  <button className="val-search-clear" onClick={() => setCompareSearch('')}>✕</button>
                )}
              </div>
              <div className="val-compare-chips">
                {companies.length === 0 && (
                  <span className="val-compare-empty-hint">请先在「快照记录」中添加数据</span>
                )}
                {filteredCompanies.length === 0 && companies.length > 0 && (
                  <span className="val-compare-empty-hint">没有匹配的公司</span>
                )}
                {filteredCompanies.map(c => (
                  <button
                    key={c.ticker}
                    className={`val-filter-chip${compareSelected.includes(c.ticker) ? ' active' : ''}`}
                    onClick={() => toggleCompare(c.ticker)}
                  >
                    {c.ticker} · {c.companyName}
                  </button>
                ))}
              </div>
            </div>

            {compareSnapshots.length === 0 ? (
              <div className="val-empty" style={{ marginTop: 40 }}>
                {companies.length === 0
                  ? '暂无数据，请先添加估值快照'
                  : '请在上方勾选公司进行对比（支持多选）'}
              </div>
            ) : (
              <div className="val-table-wrap">
                <table className="val-cmp-table">
                  <thead>
                    <tr>
                      <th className="val-cmp-metric-header">指标</th>
                      {compareSnapshots.map(s => (
                        <th key={s.ticker} className="val-cmp-company-header">
                          <div className="val-cmp-ticker">{s.ticker}</div>
                          <div className="val-cmp-name">{s.companyName}</div>
                          <div className="val-cmp-date">@ {s.snapshotDate}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map(m => {
                      const best = getBestValue(m);
                      return (
                        <tr key={m.key}>
                          <td className="val-cmp-metric-label">{m.label}</td>
                          {compareSnapshots.map(s => {
                            const val = m.computeValue ? m.computeValue(s) : (s[m.key] as number | null | undefined) ?? null;
                            const isBest = val != null && val === best;
                            const cellContent = m.key === 'grossMargin' ? (() => {
                              const avg = avgGrossMargin(s);
                              if (avg == null) return fmtNum(s.grossMargin, true);
                              return (
                                <span className="val-ni-avg"
                                  onMouseEnter={e => openTip(e, [
                                    { label: 'Q1 (最早)', value: fmtNum(s.grossMarginQ1, true) },
                                    { label: 'Q2', value: fmtNum(s.grossMarginQ2, true) },
                                    { label: 'Q3', value: fmtNum(s.grossMarginQ3, true) },
                                    { label: 'Q4 (最新)', value: fmtNum(s.grossMarginQ4, true) },
                                  ])}
                                  onMouseLeave={closeTip}
                                >{fmtNum(avg, true)}</span>
                              );
                            })() : m.key === 'ttmRoicY4' ? (() => {
                              const roic = s.ttmRoicY4;
                              const hasHistory = [s.ttmRoicY1, s.ttmRoicY2, s.ttmRoicY3].some(v => v != null);
                              if (roic == null) return '—';
                              if (!hasHistory) return fmtNum(roic, true);
                              return (
                                <span className="val-ni-avg"
                                  onMouseEnter={e => openTip(e, [
                                    { label: 'Y1 (最早)', value: fmtNum(s.ttmRoicY1, true) },
                                    { label: 'Y2',        value: fmtNum(s.ttmRoicY2, true) },
                                    { label: 'Y3',        value: fmtNum(s.ttmRoicY3, true) },
                                    { label: 'Y4 (最新)', value: fmtNum(s.ttmRoicY4, true) },
                                  ])}
                                  onMouseLeave={closeTip}
                                >{fmtNum(roic, true)}</span>
                              );
                            })() : fmtNum(val, m.isPercent);
                            return (
                              <td
                                key={s.ticker}
                                className={`val-cmp-cell${isBest ? ' best' : ''}`}
                              >
                                {cellContent}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detail modal ───────────────────────────────────────────────── */}
      {detailSnapshot && (
        <div className="val-form-overlay" onClick={() => setDetailSnapshot(null)}>
          <div className="val-detail-modal" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="val-detail-header">
              <div className="val-detail-id">
                <span className="val-detail-ticker">{detailSnapshot.ticker}</span>
                <span className="val-detail-company">{detailSnapshot.companyName}</span>
              </div>
              <span className="val-detail-date">{detailSnapshot.snapshotDate}</span>
            </div>

            {/* Valuation metrics */}
            <div className="val-detail-metrics">
              {[
                { label: 'PE',               value: fmtNum(detailSnapshot.pe) },
                { label: 'PS',               value: fmtNum(detailSnapshot.ps) },
                { label: 'NTM PE',           value: fmtNum(detailSnapshot.ntmPe) },
                { label: 'NTM PS',           value: fmtNum(detailSnapshot.ntmPs) },
                { label: 'FCF Mul',          value: fmtNum(detailSnapshot.fcfMultiple) },
                { label: 'Fwd FCF Mul',      value: fmtNum(detailSnapshot.fwdFcfMultiple) },
                { label: '毛利率',           value: fmtNum(detailSnapshot.grossMargin, true) },
                { label: '净利率',           value: fmtNum(detailSnapshot.netMargin, true) },
                { label: 'Non-GAAP 净利率',  value: fmtNum(detailSnapshot.nonGaapNetMargin, true) },
                { label: 'TTM ROIC',         value: fmtNum(detailSnapshot.ttmRoicY4, true) },
              ].map(m => (
                <div key={m.label} className="val-detail-metric">
                  <div className="val-detail-metric-label">{m.label}</div>
                  <div className="val-detail-metric-value">{m.value}</div>
                </div>
              ))}
            </div>

            {/* Quarterly gross margin */}
            {[detailSnapshot.grossMarginQ1, detailSnapshot.grossMarginQ2,
              detailSnapshot.grossMarginQ3, detailSnapshot.grossMarginQ4].some(v => v != null) && (
              <div className="val-detail-section">
                <div className="val-detail-section-title">过去四季度毛利率</div>
                <div className="val-detail-quarters">
                  {[
                    { label: 'Q1（最早）', val: detailSnapshot.grossMarginQ1 },
                    { label: 'Q2',        val: detailSnapshot.grossMarginQ2 },
                    { label: 'Q3',        val: detailSnapshot.grossMarginQ3 },
                    { label: 'Q4（最新）', val: detailSnapshot.grossMarginQ4 },
                  ].map(q => (
                    <div key={q.label} className="val-detail-quarter">
                      <div className="val-detail-quarter-label">{q.label}</div>
                      <div className="val-detail-quarter-value">{fmtNum(q.val, true)}</div>
                    </div>
                  ))}
                  <div className="val-detail-quarter val-detail-quarter-avg">
                    <div className="val-detail-quarter-label">季均</div>
                    <div className="val-detail-quarter-value">
                      {fmtNum(avgGrossMargin(detailSnapshot), true)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quarterly net margin */}
            {[detailSnapshot.netMarginQ1, detailSnapshot.netMarginQ2,
              detailSnapshot.netMarginQ3, detailSnapshot.netMarginQ4].some(v => v != null) && (
              <div className="val-detail-section">
                <div className="val-detail-section-title">过去四季度净利率</div>
                <div className="val-detail-quarters">
                  {[
                    { label: 'Q1（最早）', val: detailSnapshot.netMarginQ1 },
                    { label: 'Q2',        val: detailSnapshot.netMarginQ2 },
                    { label: 'Q3',        val: detailSnapshot.netMarginQ3 },
                    { label: 'Q4（最新）', val: detailSnapshot.netMarginQ4 },
                  ].map(q => (
                    <div key={q.label} className="val-detail-quarter">
                      <div className="val-detail-quarter-label">{q.label}</div>
                      <div className="val-detail-quarter-value">{fmtNum(q.val, true)}</div>
                    </div>
                  ))}
                  <div className="val-detail-quarter val-detail-quarter-avg">
                    <div className="val-detail-quarter-label">季均</div>
                    <div className="val-detail-quarter-value">
                      {fmtNum(avgNetIncome(detailSnapshot), true)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TTM ROIC history */}
            {[detailSnapshot.ttmRoicY1, detailSnapshot.ttmRoicY2,
              detailSnapshot.ttmRoicY3, detailSnapshot.ttmRoicY4].some(v => v != null) && (
              <div className="val-detail-section">
                <div className="val-detail-section-title">近四年 TTM ROIC（Y1=最早，Y4=最新）</div>
                <div className="val-detail-quarters">
                  {[
                    { label: 'Y1（最早）', val: detailSnapshot.ttmRoicY1 },
                    { label: 'Y2',        val: detailSnapshot.ttmRoicY2 },
                    { label: 'Y3',        val: detailSnapshot.ttmRoicY3 },
                    { label: 'Y4（最新）', val: detailSnapshot.ttmRoicY4 },
                  ].map(q => (
                    <div key={q.label} className="val-detail-quarter">
                      <div className="val-detail-quarter-label">{q.label}</div>
                      <div className="val-detail-quarter-value">{fmtNum(q.val, true)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {detailSnapshot.notes && (
              <div className="val-detail-section">
                <div className="val-detail-section-title">备注</div>
                <div className="val-detail-notes">{detailSnapshot.notes}</div>
              </div>
            )}

            {/* Actions */}
            <div className="val-form-actions">
              <button className="val-action-btn danger" onClick={() =>
                handleDelete(detailSnapshot.id, () => setDetailSnapshot(null))
              }>删除</button>
              <div style={{ flex: 1 }} />
              <button className="cancel-btn" onClick={() => setDetailSnapshot(null)}>关闭</button>
              <button className="confirm-btn" onClick={() => {
                setDetailSnapshot(null);
                openEdit(detailSnapshot);
              }}>编辑</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import modal ───────────────────────────────────────────────── */}
      {importOpen && (
        <div className="val-form-overlay" onClick={closeImport}>
          <div className="val-form-modal val-import-modal" onClick={e => e.stopPropagation()}>
            <div className="val-form-title">批量导入估值快照（JSON）</div>

            {/* Mode toggle */}
            <div className="val-import-mode-bar">
              <button
                className={`val-import-mode-btn${importMode === 'add' ? ' active' : ''}`}
                onClick={() => setImportMode('add')}
              >
                ＋ 新增模式
              </button>
              <button
                className={`val-import-mode-btn${importMode === 'update' ? ' active' : ''}`}
                onClick={() => setImportMode('update')}
              >
                ↻ 更新模式
              </button>
            </div>
            <p className="val-import-hint">
              {importMode === 'add'
                ? <>粘贴 JSON 数组，每条记录必须包含 <code>ticker</code>、<code>companyName</code>、<code>snapshotDate</code>，其余字段可选。</>
                : <>更新模式：按 <code>ticker</code> 匹配<strong>最近一条</strong>快照并覆盖，<code>snapshotDate</code> 缺失时自动填今天；JSON 中为 <code>null</code> 的字段保留原值。找不到的 ticker 自动新增。</>
              }
            </p>
            <pre className="val-import-example">{`[
  {
    "ticker": "AAPL",
    "companyName": "Apple Inc.",
    "snapshotDate": "2026-05-16",
    "pe": 28.5,
    "ps": 7.2,
    "ntmPe": 25.0,
    "ntmPs": 6.8,
    "fcfMultiple": 32.0,
    "fwdFcfMultiple": 28.5,
    "grossMargin": 0.462,
    "grossMarginQ1": 0.465,
    "grossMarginQ2": 0.461,
    "grossMarginQ3": 0.458,
    "grossMarginQ4": 0.464,
    "netMargin": 0.241,
    "nonGaapNetMargin": 0.263,
    "netMarginQ1": 0.251,
    "netMarginQ2": 0.248,
    "netMarginQ3": 0.259,
    "netMarginQ4": 0.206,
    "ttmRoicY1": 0.28,
    "ttmRoicY2": 0.31,
    "ttmRoicY3": 0.35,
    "ttmRoicY4": 0.38,
    "notes": "可选备注"
  }
]`}</pre>
            <textarea
              className="val-form-input val-import-textarea"
              placeholder="在此粘贴 JSON…"
              value={importJson}
              onChange={e => { setImportJson(e.target.value); setImportError(null); }}
            />
            {importError && <div className="val-import-error">{importError}</div>}
            <div className="val-form-actions">
              <button className="cancel-btn" onClick={closeImport}>取消</button>
              <button className="confirm-btn" disabled={importing || !importJson.trim()} onClick={handleImport}>
                {importing ? '处理中…' : importMode === 'update' ? '确认更新' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Form modal ─────────────────────────────────────────────────── */}
      {formOpen && (
        <div className="val-form-overlay" onClick={closeForm}>
          <div className="val-form-modal" onClick={e => e.stopPropagation()}>
            <div className="val-form-title">
              {editingId != null ? '编辑估值快照' : '添加估值快照'}
            </div>

            <div className="val-form-grid">
              {/* Row 1: ticker + company */}
              <div className="val-form-group">
                <label className="val-form-label">股票代码 *</label>
                <input
                  className="val-form-input"
                  placeholder="如 AAPL / 600519"
                  value={form.ticker}
                  onChange={e => {
                    const ticker = e.target.value.toUpperCase();
                    const known = companies.find(c => c.ticker === ticker);
                    setForm(prev => ({
                      ...prev,
                      ticker,
                      companyName: known ? known.companyName : prev.companyName,
                    }));
                  }}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">公司名称 *</label>
                <input
                  className="val-form-input"
                  placeholder="如 Apple Inc."
                  value={form.companyName}
                  onChange={e => setForm(prev => ({ ...prev, companyName: e.target.value }))}
                />
              </div>

              {/* Row 2: date (full width) */}
              <div className="val-form-group full">
                <label className="val-form-label">快照日期 *</label>
                <input
                  className="val-form-input"
                  type="date"
                  value={form.snapshotDate}
                  onChange={e => setForm(prev => ({ ...prev, snapshotDate: e.target.value }))}
                />
              </div>

              {/* Metric inputs */}
              <div className="val-form-group">
                <label className="val-form-label">PE</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder="留空"
                  value={numValue('pe')}
                  onChange={numChange('pe')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">PS</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder="留空"
                  value={numValue('ps')}
                  onChange={numChange('ps')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">NTM PE</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder="留空"
                  value={numValue('ntmPe')}
                  onChange={numChange('ntmPe')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">NTM PS</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder="留空"
                  value={numValue('ntmPs')}
                  onChange={numChange('ntmPs')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">FCF Mul</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder="留空"
                  value={numValue('fcfMultiple')}
                  onChange={numChange('fcfMultiple')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Fwd FCF Mul</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder="留空"
                  value={numValue('fwdFcfMultiple')}
                  onChange={numChange('fwdFcfMultiple')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">毛利率 %</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.001"
                  placeholder="如 0.786"
                  value={numValue('grossMargin')}
                  onChange={numChange('grossMargin')}
                />
              </div>

              {/* Quarterly gross margin */}
              <div className="val-form-group full val-form-section-label">
                过去四季度毛利率 %（Q1 = 最早季度）
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Q1 毛利率 %（最早）</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder="最近一个季度"
                  value={numValue('grossMarginQ1')}
                  onChange={numChange('grossMarginQ1')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Q2 毛利率 %</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder=""
                  value={numValue('grossMarginQ2')}
                  onChange={numChange('grossMarginQ2')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Q3 毛利率 %</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder=""
                  value={numValue('grossMarginQ3')}
                  onChange={numChange('grossMarginQ3')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Q4 毛利率 %（最新）</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder=""
                  value={numValue('grossMarginQ4')}
                  onChange={numChange('grossMarginQ4')}
                />
              </div>

              <div className="val-form-group">
                <label className="val-form-label">净利率 %</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.001"
                  placeholder="如 0.241"
                  value={numValue('netMargin')}
                  onChange={numChange('netMargin')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Non-GAAP 净利率 %</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.001"
                  placeholder="如 0.263，扣非 TTM"
                  value={numValue('nonGaapNetMargin')}
                  onChange={numChange('nonGaapNetMargin')}
                />
              </div>

              {/* Quarterly net margin */}
              <div className="val-form-group full val-form-section-label">
                过去四季度净利率 %（Q1 = 最早季度）
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Q1 净利率 %（最早）</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder="最近一个季度"
                  value={numValue('netMarginQ1')}
                  onChange={numChange('netMarginQ1')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Q2 净利率 %</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder=""
                  value={numValue('netMarginQ2')}
                  onChange={numChange('netMarginQ2')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Q3 净利率 %</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder=""
                  value={numValue('netMarginQ3')}
                  onChange={numChange('netMarginQ3')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Q4 净利率 %（最新）</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.01"
                  placeholder=""
                  value={numValue('netMarginQ4')}
                  onChange={numChange('netMarginQ4')}
                />
              </div>

              {/* TTM ROIC */}
              <div className="val-form-group full val-form-section-label">
                近四年 TTM ROIC（Y1 = 最早，Y4 = 最新，小数形式如 0.35）
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Y1 ROIC（最早）</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.001"
                  placeholder="如 0.28"
                  value={numValue('ttmRoicY1')}
                  onChange={numChange('ttmRoicY1')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Y2 ROIC</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.001"
                  placeholder=""
                  value={numValue('ttmRoicY2')}
                  onChange={numChange('ttmRoicY2')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Y3 ROIC</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.001"
                  placeholder=""
                  value={numValue('ttmRoicY3')}
                  onChange={numChange('ttmRoicY3')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">Y4 ROIC（最新，显示用）</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.001"
                  placeholder="如 0.38"
                  value={numValue('ttmRoicY4')}
                  onChange={numChange('ttmRoicY4')}
                />
              </div>

              {/* Notes */}
              <div className="val-form-group full">
                <label className="val-form-label">备注</label>
                <textarea
                  className="val-form-input"
                  rows={3}
                  placeholder="可选，如来源、市场环境等"
                  value={form.notes ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="val-form-actions">
              <button className="cancel-btn" onClick={closeForm}>取消</button>
              <button className="confirm-btn" disabled={saving} onClick={handleSave}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fixed tooltip ───────────────────────────────────────────────── */}
      {avgTip && (
        <div
          className="val-ni-tip-fixed"
          style={{
            left: avgTip.x,
            ...(avgTip.above
              ? { top: avgTip.y, transform: 'translateY(-100%)' }
              : { top: avgTip.y }),
          }}
        >
          {avgTip.lines.map(l => (
            <span key={l.label}>{l.label}: {l.value}</span>
          ))}
        </div>
      )}

    </div>
  );
}
