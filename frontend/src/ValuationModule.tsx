import { useState, useEffect } from 'react';
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
}

const METRICS: MetricDef[] = [
  { key: 'pe',          label: 'PE',      isPercent: false, lowIsBetter: true  },
  { key: 'ps',          label: 'PS',      isPercent: false, lowIsBetter: true  },
  { key: 'ntmPe',       label: 'NTM PE',  isPercent: false, lowIsBetter: true  },
  { key: 'ntmPs',       label: 'NTM PS',  isPercent: false, lowIsBetter: true  },
  { key: 'grossMargin', label: '毛利率',  isPercent: true,  lowIsBetter: false },
  { key: 'netMargin',   label: '净利率',  isPercent: true,  lowIsBetter: false },
];

function fmtNum(v: number | null | undefined, isPercent = false): string {
  if (v == null) return '—';
  return isPercent ? `${v.toFixed(1)}%` : v.toFixed(1);
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
    grossMargin: undefined,
    netMargin: undefined,
    notes: '',
  };
}

interface Props {
  onGoHome: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ValuationModule({ onGoHome }: Props) {
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains('dark'));
  const [tab, setTab] = useState<TabId>('list');
  const [snapshots, setSnapshots] = useState<ValuationSnapshot[]>([]);
  const [companies, setCompanies] = useState<ValuationCompany[]>([]);
  const [filterTicker, setFilterTicker] = useState<string | null>(null);
  const [compareSelected, setCompareSelected] = useState<string[]>([]);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<ValuationSnapshot, 'id' | 'createdAt'>>(emptyForm());
  const [saving, setSaving] = useState(false);

  // ── Dark mode sync ──────────────────────────────────────────────────────
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
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

  const filteredSnapshots = filterTicker
    ? snapshots.filter(s => s.ticker === filterTicker)
    : snapshots;

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
      grossMargin: s.grossMargin,
      netMargin: s.netMargin,
      notes: s.notes ?? '',
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
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

  async function handleDelete(id: number) {
    if (!confirm('确定删除这条快照记录？')) return;
    await deleteValuationSnapshot(id);
    await loadData();
  }

  function toggleCompare(ticker: string) {
    setCompareSelected(prev =>
      prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]
    );
  }

  // Highlight the best value in a column across compared companies
  function getBestValue(key: keyof ValuationSnapshot, lowIsBetter: boolean): number | null {
    const vals = compareSnapshots
      .map(s => s[key] as number | null | undefined)
      .filter((v): v is number => v != null);
    if (vals.length < 2) return null; // only highlight when comparing ≥2
    return lowIsBetter ? Math.min(...vals) : Math.max(...vals);
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

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      {/* Header */}
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome} title="返回主页">⌂</button>
          <h1 className="app-title">估值比较</h1>
        </div>
        <div className="header-right">
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
            {/* Company filter */}
            <div className="val-filter-bar">
              <button
                className={`val-filter-chip${filterTicker === null ? ' active' : ''}`}
                onClick={() => setFilterTicker(null)}
              >全部</button>
              {companies.map(c => (
                <button
                  key={c.ticker}
                  className={`val-filter-chip${filterTicker === c.ticker ? ' active' : ''}`}
                  onClick={() => setFilterTicker(filterTicker === c.ticker ? null : c.ticker)}
                >
                  {c.ticker} · {c.companyName}
                </button>
              ))}
            </div>

            {/* Snapshot table */}
            <div className="val-table-wrap">
              <table className="val-table">
                <thead>
                  <tr>
                    <th>快照日期</th>
                    <th>代码</th>
                    <th>公司</th>
                    <th>PE</th>
                    <th>PS</th>
                    <th>NTM PE</th>
                    <th>NTM PS</th>
                    <th>毛利率</th>
                    <th>净利率</th>
                    <th>备注</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSnapshots.length === 0 && (
                    <tr>
                      <td colSpan={11} className="val-empty">
                        {snapshots.length === 0
                          ? '暂无数据，点击右上角「+ 添加快照」开始记录'
                          : '该公司暂无快照'}
                      </td>
                    </tr>
                  )}
                  {filteredSnapshots.map(s => (
                    <tr key={s.id} className="val-row">
                      <td className="val-date">{s.snapshotDate}</td>
                      <td><strong>{s.ticker}</strong></td>
                      <td>{s.companyName}</td>
                      <td className="val-num">{fmtNum(s.pe)}</td>
                      <td className="val-num">{fmtNum(s.ps)}</td>
                      <td className="val-num">{fmtNum(s.ntmPe)}</td>
                      <td className="val-num">{fmtNum(s.ntmPs)}</td>
                      <td className="val-num">{fmtNum(s.grossMargin, true)}</td>
                      <td className="val-num">{fmtNum(s.netMargin, true)}</td>
                      <td className="val-note" title={s.notes ?? ''}>{s.notes ?? ''}</td>
                      <td>
                        <div className="val-row-actions">
                          <button className="val-action-btn" onClick={() => openEdit(s)}>编辑</button>
                          <button className="val-action-btn danger" onClick={() => handleDelete(s.id)}>删除</button>
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
              <span className="val-compare-label">选择公司（最新快照对比）：</span>
              <div className="val-compare-chips">
                {companies.length === 0 && (
                  <span className="val-compare-empty-hint">请先在「快照记录」中添加数据</span>
                )}
                {companies.map(c => (
                  <button
                    key={c.ticker}
                    className={`val-filter-chip${compareSelected.includes(c.ticker) ? ' active' : ''}`}
                    onClick={() => toggleCompare(c.ticker)}
                  >
                    {c.ticker} · {c.companyName}
                  </button>
                ))}
                {compareSelected.length > 0 && (
                  <button className="val-clear-btn" onClick={() => setCompareSelected([])}>
                    清除选择
                  </button>
                )}
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
                      const best = getBestValue(m.key, m.lowIsBetter);
                      return (
                        <tr key={m.key}>
                          <td className="val-cmp-metric-label">{m.label}</td>
                          {compareSnapshots.map(s => {
                            const raw = s[m.key] as number | null | undefined;
                            const isBest = raw != null && raw === best;
                            return (
                              <td
                                key={s.ticker}
                                className={`val-cmp-cell${isBest ? ' best' : ''}`}
                              >
                                {fmtNum(raw, m.isPercent)}
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
                <label className="val-form-label">毛利率 %</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.1"
                  placeholder="如 45.2"
                  value={numValue('grossMargin')}
                  onChange={numChange('grossMargin')}
                />
              </div>
              <div className="val-form-group">
                <label className="val-form-label">净利率 %</label>
                <input
                  className="val-form-input"
                  type="number"
                  step="0.1"
                  placeholder="如 24.1"
                  value={numValue('netMargin')}
                  onChange={numChange('netMargin')}
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
    </div>
  );
}
