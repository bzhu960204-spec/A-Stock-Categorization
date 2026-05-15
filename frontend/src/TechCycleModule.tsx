import { useState, useEffect, useCallback } from 'react';
import {
  getTechCycles, createTechCycle, updateTechCycle, deleteTechCycle,
  getTechCyclePhases, createTechCyclePhase, updateTechCyclePhase, deleteTechCyclePhase,
  type TechCycle, type TechCyclePhase,
} from './api';

// ── constants ─────────────────────────────────────────────────────────────────

const PHASE_TYPES: { value: TechCyclePhase['phaseType']; label: string }[] = [
  { value: 'BUDDING',  label: '萌芽期' },
  { value: 'GROWTH',   label: '成长期' },
  { value: 'BOOM',     label: '爆发期' },
  { value: 'MATURE',   label: '成熟期' },
  { value: 'DECLINE',  label: '衰退期' },
  { value: 'CUSTOM',   label: '自定义' },
];

const PHASE_COLORS: Record<string, string> = {
  BUDDING: '#6366f1',
  GROWTH:  '#22c55e',
  BOOM:    '#f97316',
  MATURE:  '#14b8a6',
  DECLINE: '#94a3b8',
  CUSTOM:  '#a855f7',
};

const CYCLE_PALETTE = [
  '#6366f1', '#f97316', '#22c55e', '#14b8a6',
  '#e05252', '#a855f7', '#eab308', '#06b6d4',
];

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

function phaseLabel(pt: string) {
  return PHASE_TYPES.find(p => p.value === pt)?.label ?? pt;
}

function phaseColor(pt: string | undefined, cycleColor?: string) {
  if (!pt || pt === 'CUSTOM') return cycleColor ?? '#6366f1';
  return PHASE_COLORS[pt] ?? '#6366f1';
}

function formatYQ(year: number, q?: number | null) {
  return q ? `${year} Q${q}` : `${year}`;
}

// span in quarter-units for timeline sizing
function spanQ(phase: TechCyclePhase) {
  const s = (phase.startYear * 4) + ((phase.startQuarter ?? 1) - 1);
  const e = (phase.endYear * 4) + ((phase.endQuarter ?? 4) - 1);
  return Math.max(1, e - s + 1);
}

function startQ(phase: TechCyclePhase) {
  return (phase.startYear * 4) + ((phase.startQuarter ?? 1) - 1);
}

// ── Phase form modal ──────────────────────────────────────────────────────────

interface PhaseFormData {
  title: string;
  phaseType: TechCyclePhase['phaseType'];
  startYear: number;
  startQuarter: number | '';
  endYear: number;
  endQuarter: number | '';
  notes: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const EMPTY_PHASE_FORM: PhaseFormData = {
  title: '',
  phaseType: 'GROWTH',
  startYear: CURRENT_YEAR,
  startQuarter: '',
  endYear: CURRENT_YEAR + 1,
  endQuarter: '',
  notes: '',
};

interface PhaseModalProps {
  initial: PhaseFormData;
  title: string;
  onSave: (d: PhaseFormData) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function PhaseModal({ initial, title, onSave, onCancel, onDelete }: PhaseModalProps) {
  const [form, setForm] = useState<PhaseFormData>(initial);

  const setF = <K extends keyof PhaseFormData>(key: K, val: PhaseFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (form.startYear > form.endYear) return;
    onSave(form);
  };

  return (
    <div className="tc-modal-overlay" onClick={() => { if (window.confirm('有未保存的内容，确定要放弃并关闭？')) onCancel(); }}>
      <div className="tc-modal" onClick={e => e.stopPropagation()}>
        <div className="tc-modal-header">
          <span>{title}</span>
          <button className="cal-modal-close" onClick={onCancel}>✕</button>
        </div>
        <form className="tc-modal-form" onSubmit={handleSubmit}>
          <label>
            <span>阶段名称 *</span>
            <input value={form.title} onChange={e => setF('title', e.target.value)} placeholder="如：爆发增长期" required />
          </label>

          <label>
            <span>阶段类型</span>
            <div className="tc-phase-type-grid">
              {PHASE_TYPES.map(pt => (
                <button
                  key={pt.value}
                  type="button"
                  className={`tc-phase-type-btn${form.phaseType === pt.value ? ' active' : ''}`}
                  style={{ '--phase-c': PHASE_COLORS[pt.value!] } as React.CSSProperties}
                  onClick={() => setF('phaseType', pt.value)}
                >
                  {pt.label}
                </button>
              ))}
            </div>
          </label>

          <div className="tc-modal-row">
            <label>
              <span>开始年份 *</span>
              <input
                type="number"
                value={form.startYear}
                onChange={e => setF('startYear', Number(e.target.value))}
                placeholder="如 1990"
                required
              />
            </label>
            <label>
              <span>开始季度</span>
              <select value={form.startQuarter} onChange={e => setF('startQuarter', e.target.value ? Number(e.target.value) : '')}>
                <option value="">不限</option>
                {QUARTERS.map((q, i) => <option key={q} value={i + 1}>{q}</option>)}
              </select>
            </label>
          </div>

          <div className="tc-modal-row">
            <label>
              <span>结束年份 *</span>
              <input
                type="number"
                value={form.endYear}
                onChange={e => setF('endYear', Number(e.target.value))}
                placeholder="如 2030"
                required
              />
            </label>
            <label>
              <span>结束季度</span>
              <select value={form.endQuarter} onChange={e => setF('endQuarter', e.target.value ? Number(e.target.value) : '')}>
                <option value="">不限</option>
                {QUARTERS.map((q, i) => <option key={q} value={i + 1}>{q}</option>)}
              </select>
            </label>
          </div>

          <label>
            <span>描述 / 趋势分析</span>
            <textarea
              value={form.notes}
              onChange={e => setF('notes', e.target.value)}
              placeholder="描述这一阶段的市场趋势、关注方向…"
              rows={4}
            />
          </label>

          <div className="tc-modal-actions">
            {onDelete && (
              <button type="button" className="cal-btn cal-btn-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>删除阶段</button>
            )}
            <button type="button" className="cal-btn cal-btn-ghost" onClick={onCancel}>取消</button>
            <button type="submit" className="cal-btn cal-btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Cycle form modal ──────────────────────────────────────────────────────────

interface CycleModalProps {
  initial: { name: string; description: string; color: string };
  title: string;
  onSave: (d: { name: string; description: string; color: string }) => void;
  onCancel: () => void;
}

function CycleModal({ initial, title, onSave, onCancel }: CycleModalProps) {
  const [form, setForm] = useState(initial);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <div className="tc-modal-overlay" onClick={() => { if (window.confirm('有未保存的内容，确定要放弃并关闭？')) onCancel(); }}>
      <div className="tc-modal" onClick={e => e.stopPropagation()}>
        <div className="tc-modal-header">
          <span>{title}</span>
          <button className="cal-modal-close" onClick={onCancel}>✕</button>
        </div>
        <form className="tc-modal-form" onSubmit={handleSubmit}>
          <label>
            <span>技术 / 板块名称 *</span>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="如：人工智能、新能源汽车…" required />
          </label>
          <label>
            <span>简介</span>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="可选" />
          </label>
          <label>
            <span>标识颜色</span>
            <div className="tc-color-picker">
              {CYCLE_PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`tc-color-dot${form.color === c ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                />
              ))}
            </div>
          </label>
          <div className="tc-modal-actions">
            <button type="button" className="cal-btn cal-btn-ghost" onClick={onCancel}>取消</button>
            <button type="submit" className="cal-btn cal-btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Timeline view ─────────────────────────────────────────────────────────────

interface TimelineProps {
  cycle: TechCycle;
  phases: TechCyclePhase[];
  onEditPhase: (p: TechCyclePhase) => void;
  onAddPhase: () => void;
}

function Timeline({ cycle, phases, onEditPhase, onAddPhase }: TimelineProps) {
  if (phases.length === 0) {
    return (
      <div className="tc-timeline-empty">
        <div>暂无阶段</div>
        <button className="cal-btn cal-btn-primary" onClick={onAddPhase}>＋ 添加第一个阶段</button>
      </div>
    );
  }

  const minQ = Math.min(...phases.map(startQ));
  const maxQ = Math.max(...phases.map(p => startQ(p) + spanQ(p) - 1));
  const totalQ = maxQ - minQ + 1;

  // Collect year labels — step adapts to span so markers don't crowd
  const minYear = Math.floor(minQ / 4);
  const maxYear = Math.floor(maxQ / 4);
  const yearSpan = maxYear - minYear + 1;
  const step = yearSpan <= 15 ? 1
              : yearSpan <= 30 ? 2
              : yearSpan <= 60 ? 5
              : yearSpan <= 120 ? 10
              : 25;
  const yearMarkers: { year: number; left: number }[] = [];
  // start at the first year that is a multiple of step (looks clean on ruler)
  const firstMark = Math.ceil(minYear / step) * step;
  for (let y = firstMark; y <= maxYear; y += step) {
    const qIdx = y * 4 - minQ;
    yearMarkers.push({ year: y, left: (qIdx / totalQ) * 100 });
  }

  const todayQ = new Date().getFullYear() * 4 + Math.floor(new Date().getMonth() / 3);
  const todayLeft = todayQ >= minQ && todayQ <= maxQ
    ? ((todayQ - minQ) / totalQ) * 100
    : null;

  return (
    <div className="tc-timeline-wrap">
      {/* header: year markers */}
      <div className="tc-year-ruler">
        {yearMarkers.map(m => (
          <div key={m.year} className="tc-year-mark" style={{ left: `${m.left}%` }}>
            {m.year}
          </div>
        ))}
        {todayLeft !== null && (
          <div className="tc-today-line" style={{ left: `${todayLeft}%` }} title="今天" />
        )}
      </div>

      {/* phase bars */}
      <div className="tc-phase-rows">
        {phases.map(phase => {
          const left = ((startQ(phase) - minQ) / totalQ) * 100;
          const width = (spanQ(phase) / totalQ) * 100;
          const color = phaseColor(phase.phaseType, cycle.color);

          return (
            <div key={phase.id} className="tc-phase-row" style={{ height: 52 }}>
              <div
                className="tc-phase-bar"
                title="点击编辑"
                onClick={() => onEditPhase(phase)}
                style={{ left: `${left}%`, width: `${Math.max(width, 2)}%`, '--pc': color, cursor: 'pointer' } as React.CSSProperties}
              >
                <div className="tc-phase-bar-fill" />
                <div className="tc-phase-bar-label">
                  <span className="tc-phase-bar-title">{phase.title}</span>
                  <span className="tc-phase-bar-range">
                    {formatYQ(phase.startYear, phase.startQuarter)} – {formatYQ(phase.endYear, phase.endQuarter)}
                  </span>
                </div>
                <div className="tc-phase-bar-type">{phaseLabel(phase.phaseType ?? 'CUSTOM')}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* notes panel */}
      {phases.some(p => p.notes) && (
        <div className="tc-notes-section">
          {phases.filter(p => p.notes).map(phase => {
            const color = phaseColor(phase.phaseType, cycle.color);
            return (
              <div key={phase.id} className="tc-note-card">
                <div className="tc-note-card-bar" style={{ background: color }} />
                <div className="tc-note-card-body">
                  <div className="tc-note-card-title">{phase.title}</div>
                  <div className="tc-note-card-text">{phase.notes}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface TechCycleModuleProps {
  onGoHome: () => void;
}

export default function TechCycleModule({ onGoHome }: TechCycleModuleProps) {
  const [cycles, setCycles] = useState<TechCycle[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [phases, setPhases] = useState<TechCyclePhase[]>([]);
  const [loadingPhases, setLoadingPhases] = useState(false);

  // modals
  const [showAddCycle, setShowAddCycle] = useState(false);
  const [editingCycle, setEditingCycle] = useState<TechCycle | null>(null);
  const [deleteCycleConfirm, setDeleteCycleConfirm] = useState<number | null>(null);
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [editingPhase, setEditingPhase] = useState<TechCyclePhase | null>(null);

  // load cycles
  const fetchCycles = useCallback(async () => {
    const res = await getTechCycles();
    setCycles(res.data);
  }, []);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);

  // load phases when selection changes
  const fetchPhases = useCallback(async (id: number) => {
    setLoadingPhases(true);
    try {
      const res = await getTechCyclePhases(id);
      setPhases(res.data);
    } finally {
      setLoadingPhases(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId !== null) fetchPhases(selectedId);
    else setPhases([]);
  }, [selectedId, fetchPhases]);

  const selectedCycle = cycles.find(c => c.id === selectedId) ?? null;

  // ── cycle CRUD ──
  const handleAddCycle = async (d: { name: string; description: string; color: string }) => {
    await createTechCycle(d);
    setShowAddCycle(false);
    await fetchCycles();
  };

  const handleEditCycle = async (d: { name: string; description: string; color: string }) => {
    if (!editingCycle) return;
    await updateTechCycle(editingCycle.id, d);
    setEditingCycle(null);
    await fetchCycles();
  };

  const handleDeleteCycle = async (id: number) => {
    await deleteTechCycle(id);
    setDeleteCycleConfirm(null);
    if (selectedId === id) setSelectedId(null);
    await fetchCycles();
  };

  // ── phase CRUD ──
  const buildPhasePayload = (d: PhaseFormData): Omit<TechCyclePhase, 'id' | 'techCycleId'> => ({
    title: d.title.trim(),
    phaseType: d.phaseType,
    startYear: d.startYear,
    startQuarter: d.startQuarter === '' ? undefined : Number(d.startQuarter),
    endYear: d.endYear,
    endQuarter: d.endQuarter === '' ? undefined : Number(d.endQuarter),
    notes: d.notes.trim(),
    sortOrder: 0,
  });

  const handleAddPhase = async (d: PhaseFormData) => {
    if (!selectedId) return;
    await createTechCyclePhase(selectedId, buildPhasePayload(d));
    setShowAddPhase(false);
    await fetchPhases(selectedId);
  };

  const handleEditPhase = async (d: PhaseFormData) => {
    if (!editingPhase || !selectedId) return;
    await updateTechCyclePhase(selectedId, editingPhase.id, buildPhasePayload(d));
    setEditingPhase(null);
    await fetchPhases(selectedId);
  };

  const handleDeletePhase = async (p: TechCyclePhase) => {
    if (!selectedId) return;
    await deleteTechCyclePhase(selectedId, p.id);
    setEditingPhase(null);
    await fetchPhases(selectedId);
  };

  const phaseToForm = (p: TechCyclePhase): PhaseFormData => ({
    title: p.title,
    phaseType: p.phaseType ?? 'GROWTH',
    startYear: p.startYear,
    startQuarter: p.startQuarter ?? '',
    endYear: p.endYear,
    endQuarter: p.endQuarter ?? '',
    notes: p.notes ?? '',
  });

  return (
    <div className="tc-root">
      {/* ── header ── */}
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome}>← 返回</button>
          <h1 className="app-title">技术周期</h1>
        </div>
        <div className="header-right">
          {selectedCycle && (
            <button className="cal-btn cal-btn-primary" onClick={() => setShowAddPhase(true)}>
              ＋ 添加阶段
            </button>
          )}
        </div>
      </header>

      <div className="tc-content">
        {/* ── left: cycle list ── */}
        <div className="tc-sidebar">
          <div className="tc-sidebar-header">
            <span className="tc-sidebar-title">技术 / 板块</span>
            <button className="cal-btn cal-btn-ghost cal-btn-sm" onClick={() => setShowAddCycle(true)}>＋</button>
          </div>

          {cycles.length === 0 ? (
            <div className="tc-sidebar-empty">点击右上角「＋」添加技术</div>
          ) : (
            <div className="tc-cycle-list">
              {cycles.map(c => (
                <div
                  key={c.id}
                  className={`tc-cycle-item${selectedId === c.id ? ' active' : ''}`}
                  onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                >
                  <div className="tc-cycle-dot" style={{ background: c.color ?? '#6366f1' }} />
                  <div className="tc-cycle-info">
                    <div className="tc-cycle-name">{c.name}</div>
                    {c.description && <div className="tc-cycle-desc">{c.description}</div>}
                  </div>
                  <div className="tc-cycle-actions" onClick={e => e.stopPropagation()}>
                    <button className="tc-icon-btn" onClick={() => setEditingCycle(c)} title="编辑">✎</button>
                    {deleteCycleConfirm === c.id ? (
                      <>
                        <button className="tc-icon-btn tc-icon-btn-danger" onClick={() => handleDeleteCycle(c.id)}>✓</button>
                        <button className="tc-icon-btn" onClick={() => setDeleteCycleConfirm(null)}>✕</button>
                      </>
                    ) : (
                      <button className="tc-icon-btn tc-icon-btn-muted" onClick={() => setDeleteCycleConfirm(c.id)} title="删除">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── right: timeline ── */}
        <div className="tc-main">
          {!selectedCycle ? (
            <div className="tc-empty-state">
              <div className="tc-empty-icon">⏱</div>
              <div>从左侧选择一个技术 / 板块</div>
              <div className="tc-empty-sub">查看或编辑其发展周期时间线</div>
            </div>
          ) : (
            <>
              <div className="tc-main-header">
                <div className="tc-main-title">
                  <span className="tc-main-dot" style={{ background: selectedCycle.color ?? '#6366f1' }} />
                  <span>{selectedCycle.name}</span>
                  {selectedCycle.description && (
                    <span className="tc-main-desc">{selectedCycle.description}</span>
                  )}
                </div>
                <div className="tc-legend">
                  {PHASE_TYPES.map(pt => (
                    <span key={pt.value} className="tc-legend-item">
                      <span className="tc-legend-dot" style={{ background: PHASE_COLORS[pt.value!] }} />
                      {pt.label}
                    </span>
                  ))}
                </div>
              </div>

              {loadingPhases ? (
                <div className="tc-loading">加载中…</div>
              ) : (
                <Timeline
                  cycle={selectedCycle}
                  phases={phases}
                  onEditPhase={p => setEditingPhase(p)}
                  onAddPhase={() => setShowAddPhase(true)}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* ── modals ── */}
      {showAddCycle && (
        <CycleModal
          title="添加技术 / 板块"
          initial={{ name: '', description: '', color: CYCLE_PALETTE[cycles.length % CYCLE_PALETTE.length] }}
          onSave={handleAddCycle}
          onCancel={() => setShowAddCycle(false)}
        />
      )}
      {editingCycle && (
        <CycleModal
          title="编辑技术 / 板块"
          initial={{ name: editingCycle.name, description: editingCycle.description ?? '', color: editingCycle.color ?? CYCLE_PALETTE[0] }}
          onSave={handleEditCycle}
          onCancel={() => setEditingCycle(null)}
        />
      )}
      {showAddPhase && (
        <PhaseModal
          title="添加阶段"
          initial={EMPTY_PHASE_FORM}
          onSave={handleAddPhase}
          onCancel={() => setShowAddPhase(false)}
        />
      )}
      {editingPhase && (
        <PhaseModal
          title="编辑阶段"
          initial={phaseToForm(editingPhase)}
          onSave={handleEditPhase}
          onCancel={() => setEditingPhase(null)}
          onDelete={() => handleDeletePhase(editingPhase)}
        />
      )}
    </div>
  );
}
