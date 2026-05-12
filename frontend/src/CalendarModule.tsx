import { useState, useEffect, useCallback } from 'react';
import {
  getMarketEvents, createMarketEvent, updateMarketEvent, deleteMarketEvent,
  type MarketEvent,
} from './api';

// ── JSON import types ─────────────────────────────────────────────────────────
interface ImportEventItem {
  title: string;
  date: string;            // "YYYY-MM-DD"
  description?: string;
  category?: string;       // 政策 | 财报 | 经济数据 | 央行 | 其他
  importance?: 'HIGH' | 'MEDIUM' | 'LOW';
}
interface ImportResult { ok: number; skipped: string[] }

// ── helpers ──────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate(); // month is 1-based here
}

function firstDayOfMonth(year: number, month: number) {
  // 0=Sun … 6=Sat; we use Monday as first column (0=Mon … 6=Sun)
  const d = new Date(year, month - 1, 1).getDay();
  return (d + 6) % 7;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

const IMPORTANCE_LABELS: Record<string, string> = { HIGH: '重要', MEDIUM: '一般', LOW: '参考' };
const IMPORTANCE_COLORS: Record<string, string> = {
  HIGH: 'var(--cal-high)',
  MEDIUM: 'var(--cal-medium)',
  LOW: 'var(--cal-low)',
};

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// ── sub-components ────────────────────────────────────────────────────────────

interface EventFormData {
  title: string;
  eventDate: string;
  description: string;
  category: string;
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
}

const EMPTY_FORM: EventFormData = {
  title: '',
  eventDate: '',
  description: '',
  category: '其他',
  importance: 'MEDIUM',
};

interface EventModalProps {
  initial: EventFormData;
  onSave: (data: EventFormData) => void;
  onCancel: () => void;
  title: string;
}

function EventModal({ initial, onSave, onCancel, title }: EventModalProps) {
  const [form, setForm] = useState<EventFormData>(initial);

  const set = (key: keyof EventFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.eventDate) return;
    onSave(form);
  };

  return (
    <div className="cal-modal-overlay" onClick={onCancel}>
      <div className="cal-modal" onClick={e => e.stopPropagation()}>
        <div className="cal-modal-header">
          <span>{title}</span>
          <button className="cal-modal-close" onClick={onCancel}>✕</button>
        </div>
        <form className="cal-modal-form" onSubmit={handleSubmit}>
          <label>
            <span>事件标题 *</span>
            <input value={form.title} onChange={set('title')} placeholder="输入事件标题" required />
          </label>
          <label>
            <span>日期 *</span>
            <input type="date" value={form.eventDate} onChange={set('eventDate')} required />
          </label>
          <div className="cal-modal-row">
            <label>
              <span>分类</span>
              <input value={form.category} onChange={set('category')} placeholder="如：政策、财报、央行…" />
            </label>
            <label>
              <span>重要程度</span>
              <select value={form.importance} onChange={e => setForm(f => ({ ...f, importance: e.target.value as EventFormData['importance'] }))}>
                <option value="HIGH">重要</option>
                <option value="MEDIUM">一般</option>
                <option value="LOW">参考</option>
              </select>
            </label>
          </div>
          <label>
            <span>描述</span>
            <textarea
              value={form.description}
              onChange={set('description')}
              placeholder="可选：详细说明"
              rows={4}
            />
          </label>
          <div className="cal-modal-actions">
            <button type="button" className="cal-btn cal-btn-ghost" onClick={onCancel}>取消</button>
            <button type="submit" className="cal-btn cal-btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Import Modal ────────────────────────────────────────────────────────────────────────

const IMPORT_PLACEHOLDER = `[
  {
    "title": "美联储议息会议",
    "date": "2026-06-18",
    "category": "央行",
    "importance": "HIGH",
    "description": "关注是否降息及点阵图变化"
  },
  {
    "title": "中国5月CPI数据公布",
    "date": "2026-06-10",
    "category": "经济数据",
    "importance": "MEDIUM"
  }
]`;

interface ImportModalProps {
  onImport: (text: string, mode: 'append' | 'replace') => void;
  onCancel: () => void;
  importing: boolean;
  error: string;
}

function ImportModal({ onImport, onCancel, importing, error }: ImportModalProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onImport(text, mode);
  };

  return (
    <div className="cal-modal-overlay" onClick={onCancel}>
      <div className="cal-modal cal-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="cal-modal-header">
          <span>导入 JSON 事件</span>
          <button className="cal-modal-close" onClick={onCancel}>✕</button>
        </div>
        <form className="cal-modal-form" onSubmit={handleSubmit}>
          <label>
            <span>将 JSON 粘贴到下方</span>
            <textarea
              className="cal-import-textarea"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={IMPORT_PLACEHOLDER}
              rows={8}
              spellCheck={false}
              autoFocus
            />
          </label>
          {error && <div className="cal-import-modal-err">{error}</div>}
          <div className="cal-import-mode-row">
            <span className="cal-import-mode-label">导入方式</span>
            <label className={`cal-import-mode-opt${mode === 'append' ? ' active' : ''}`}>
              <input
                type="radio"
                name="importMode"
                value="append"
                checked={mode === 'append'}
                onChange={() => setMode('append')}
              />
              <strong>新增</strong>
              <span>追加到已有事件之上，不删除任何现有数据</span>
            </label>
            <label className={`cal-import-mode-opt${mode === 'replace' ? ' active' : ''}`}>
              <input
                type="radio"
                name="importMode"
                value="replace"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
              />
              <strong>更新</strong>
              <span>先删除 JSON 中涉及日期的现有事件，再导入新数据</span>
            </label>
          </div>
          <div className="cal-import-hint">
            根节点为数组，每条必填 <code>title</code>、<code>date</code>（YYYY-MM-DD）。
            category：政策 / 财报 / 经济数据 / 央行 / 其他 &nbsp;| 
            importance： HIGH / MEDIUM / LOW
          </div>
          <div className="cal-modal-actions">
            <button type="button" className="cal-btn cal-btn-ghost" onClick={onCancel}>取消</button>
            <button type="submit" className="cal-btn cal-btn-primary" disabled={importing || !text.trim()}>
              {importing ? '导入中…' : '确认导入'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface CalendarModuleProps {
  onGoHome: () => void;
}

export default function CalendarModule({ onGoHome }: CalendarModuleProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<MarketEvent | null>(null);
  const [addInitialDate, setAddInitialDate] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMarketEvents(year, month);
      setEvents(res.data);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchEvents();
    setSelectedDay(null);
  }, [fetchEvents]);

  // ── calendar grid ──
  const totalDays = daysInMonth(year, month);
  const startOffset = firstDayOfMonth(year, month);
  const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

  // group events by day
  const eventsByDay = events.reduce<Record<number, MarketEvent[]>>((acc, ev) => {
    const day = parseInt(ev.eventDate.split('-')[2], 10);
    if (!acc[day]) acc[day] = [];
    acc[day].push(ev);
    return acc;
  }, {});

  const todayStr = toDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate());

  // ── navigation ──
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setSelectedDay(today.getDate());
  };

  // ── CRUD ──
  const handleAddClick = (day?: number) => {
    const dateStr = day ? toDateStr(year, month, day) : toDateStr(year, month, 1);
    setAddInitialDate(dateStr);
    setShowAddModal(true);
  };

  const handleAddSave = async (data: EventFormData) => {
    await createMarketEvent(data);
    setShowAddModal(false);
    await fetchEvents();
  };

  const handleEditSave = async (data: EventFormData) => {
    if (!editingEvent) return;
    await updateMarketEvent(editingEvent.id, data);
    setEditingEvent(null);
    await fetchEvents();
  };

  const handleDelete = async (id: number) => {
    await deleteMarketEvent(id);
    setDeleteConfirm(null);
    await fetchEvents();
  };

  // ── JSON import ──
  const handleImportText = async (text: string, mode: 'append' | 'replace') => {
    setImportError('');
    setImportResult(null);
    setImporting(true);
    try {
      const parsed: unknown = JSON.parse(text);
      const items: ImportEventItem[] = Array.isArray(parsed) ? parsed : (parsed as { events: ImportEventItem[] }).events;
      if (!Array.isArray(items)) throw new Error('JSON 格式错误：根节点必须是数组或含 events 字段的对象');

      const VALID_IMPORTANCE = ['HIGH', 'MEDIUM', 'LOW'];
      let ok = 0;
      const skipped: string[] = [];

      // validate items first
      const validItems: Array<{ title: string; eventDate: string; description: string; category: string; importance: 'HIGH' | 'MEDIUM' | 'LOW' }> = [];
      for (const item of items) {
        if (!item.title?.trim() || !item.date?.trim()) {
          skipped.push(`缺少 title/date: ${JSON.stringify(item).slice(0, 60)}`);
          continue;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
          skipped.push(`日期格式错误 (需 YYYY-MM-DD): "${item.date}"`);
          continue;
        }
        validItems.push({
          title: item.title.trim(),
          eventDate: item.date,
          description: item.description?.trim() ?? '',
          category: item.category?.trim() || '其他',
          importance: (VALID_IMPORTANCE.includes(item.importance ?? '') ? item.importance! : 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
        });
      }

      // 更新模式：先按日期删除现有事件
      if (mode === 'replace' && validItems.length > 0) {
        // collect unique (year-month) pairs in the import
        const monthKeys = new Set(validItems.map(v => v.eventDate.slice(0, 7))); // "YYYY-MM"
        // fetch existing events for each month and delete those on imported dates
        const importedDates = new Set(validItems.map(v => v.eventDate));
        for (const key of monthKeys) {
          const [y, m] = key.split('-').map(Number);
          const res = await getMarketEvents(y, m);
          for (const ev of res.data) {
            if (importedDates.has(ev.eventDate)) {
              await deleteMarketEvent(ev.id);
            }
          }
        }
      }

      // create new events
      for (const v of validItems) {
        await createMarketEvent(v);
        ok++;
      }

      setImportResult({ ok, skipped });
      setShowImportModal(false);
      await fetchEvents();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '解析失败，请检查 JSON 格式');
    } finally {
      setImporting(false);
    }
  };

  // ── selected day events list ──
  const selectedDayEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : [];

  return (
    <div className="cal-root">
      {/* ── header ── */}
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome}>← 返回</button>
          <h1 className="app-title">市场日历</h1>
        </div>
        <div className="header-right">
          {importResult && (
            <span className="cal-import-feedback cal-import-ok">
              ✓ 导入 {importResult.ok} 条
              {importResult.skipped.length > 0 && `，跳过 ${importResult.skipped.length} 条`}
              <button className="cal-import-dismiss" onClick={() => setImportResult(null)}>✕</button>
            </span>
          )}
          <button
            className="cal-btn cal-btn-ghost"
            onClick={() => { setShowImportModal(true); setImportError(''); }}
          >
            ⬆ 导入 JSON
          </button>
          <button className="cal-btn cal-btn-primary" onClick={() => handleAddClick()}>
            ＋ 新建事件
          </button>
        </div>
      </header>

      <div className="cal-content">
        {/* ── left: calendar ── */}
        <div className="cal-main">
          <div className="cal-nav">
            <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
            <div className="cal-nav-title">
              <select
                className="cal-nav-select"
                value={year}
                onChange={e => setYear(Number(e.target.value))}
              >
                {Array.from({ length: 21 }, (_, i) => today.getFullYear() - 5 + i).map(y => (
                  <option key={y} value={y}>{y}年</option>
                ))}
              </select>
              <select
                className="cal-nav-select"
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
              >
                {MONTHS.map((label, i) => (
                  <option key={i + 1} value={i + 1}>{label}</option>
                ))}
              </select>
            </div>
            <button className="cal-nav-btn" onClick={nextMonth}>›</button>
            <button className="cal-btn cal-btn-ghost cal-today-btn" onClick={goToday}>今天</button>
            {loading && <span className="cal-loading-inline">加载中…</span>}
          </div>

          <div className="cal-grid-wrap">
            <div className="cal-grid">
              {WEEKDAYS.map(d => (
                <div key={d} className="cal-weekday">{d}</div>
              ))}

              {Array.from({ length: totalCells }).map((_, i) => {
                const day = i - startOffset + 1;
                const isValid = day >= 1 && day <= totalDays;
                const dateStr = isValid ? toDateStr(year, month, day) : '';
                const isToday = dateStr === todayStr;
                const isSelected = isValid && day === selectedDay;
                const dayEvents = isValid ? (eventsByDay[day] ?? []) : [];
                const hasHigh = dayEvents.some(e => e.importance === 'HIGH');
                const hasMedium = dayEvents.some(e => e.importance === 'MEDIUM');

                return (
                  <div
                    key={i}
                    className={`cal-cell${!isValid ? ' cal-cell-empty' : ''}${isToday ? ' cal-cell-today' : ''}${isSelected ? ' cal-cell-selected' : ''}`}
                    onClick={() => isValid && setSelectedDay(day === selectedDay ? null : day)}
                  >
                    {isValid && (
                      <>
                        <div className="cal-cell-header">
                          <span className="cal-day-num">{day}</span>
                          {dayEvents.length > 0 && (
                            <span
                              className="cal-dot"
                              style={{ background: hasHigh ? 'var(--cal-high)' : hasMedium ? 'var(--cal-medium)' : 'var(--cal-low)' }}
                            />
                          )}
                        </div>
                        <div className="cal-cell-events">
                          {dayEvents.slice(0, 2).map(ev => (
                            <div
                              key={ev.id}
                              className="cal-chip"
                              style={{ borderLeftColor: IMPORTANCE_COLORS[ev.importance ?? 'LOW'] }}
                            >
                              {ev.title}
                            </div>
                          ))}
                          {dayEvents.length > 2 && (
                            <div className="cal-chip cal-chip-more">+{dayEvents.length - 2}</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── right: event side panel ── */}
        {selectedDay !== null && (
          <div className="cal-side-panel">
            {/* sticky header */}
            <div className="cal-side-panel-header">
              <div className="cal-side-panel-title">
                <span className="cal-detail-date">{year}年{month}月{selectedDay}日</span>
                {selectedDayEvents.length > 0 && (
                  <span className="cal-event-count">{selectedDayEvents.length} 个事件</span>
                )}
              </div>
              <div className="cal-side-panel-actions">
                <button
                  className="cal-btn cal-btn-primary cal-btn-sm"
                  onClick={() => handleAddClick(selectedDay)}
                >＋ 添加</button>
                <button
                  className="cal-modal-close"
                  title="关闭面板"
                  onClick={() => setSelectedDay(null)}
                >✕</button>
              </div>
            </div>

            {/* scrollable event list */}
            <div className="cal-side-panel-scroll">
              {selectedDayEvents.length === 0 ? (
                <div className="cal-detail-empty">
                  当天暂无事件<br />点击上方"＋ 添加"新建
                </div>
              ) : (
                <div className="cal-event-list">
                  {selectedDayEvents.map(ev => (
                    <div key={ev.id} className="cal-event-card">
                      <div className="cal-event-card-bar" style={{ background: IMPORTANCE_COLORS[ev.importance ?? 'LOW'] }} />
                      <div className="cal-event-card-body">
                        <div className="cal-event-card-title">{ev.title}</div>
                        <div className="cal-event-card-meta">
                          <span className="cal-tag">{ev.category ?? '其他'}</span>
                          <span className="cal-tag cal-tag-importance" style={{ color: IMPORTANCE_COLORS[ev.importance ?? 'LOW'] }}>
                            {IMPORTANCE_LABELS[ev.importance ?? 'LOW'] ?? ev.importance}
                          </span>
                        </div>
                        {ev.description && (
                          <div className="cal-event-card-desc">{ev.description}</div>
                        )}
                      </div>
                      <div className="cal-event-card-actions">
                        <button
                          className="cal-btn cal-btn-ghost cal-btn-sm"
                          onClick={() => setEditingEvent(ev)}
                        >编辑</button>
                        {deleteConfirm === ev.id ? (
                          <>
                            <button className="cal-btn cal-btn-danger cal-btn-sm" onClick={() => handleDelete(ev.id)}>确认删除</button>
                            <button className="cal-btn cal-btn-ghost cal-btn-sm" onClick={() => setDeleteConfirm(null)}>取消</button>
                          </>
                        ) : (
                          <button className="cal-btn cal-btn-ghost cal-btn-sm cal-btn-del" onClick={() => setDeleteConfirm(ev.id)}>删除</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── modals ── */}
      {showImportModal && (
        <ImportModal
          onImport={handleImportText}
          onCancel={() => { setShowImportModal(false); setImportError(''); }}
          importing={importing}
          error={importError}
        />
      )}

      {showAddModal && (
        <EventModal
          title="添加事件"
          initial={{ ...EMPTY_FORM, eventDate: addInitialDate }}
          onSave={handleAddSave}
          onCancel={() => setShowAddModal(false)}
        />
      )}

      {editingEvent && (
        <EventModal
          title="编辑事件"
          initial={{
            title: editingEvent.title,
            eventDate: editingEvent.eventDate,
            description: editingEvent.description ?? '',
            category: editingEvent.category ?? '其他',
            importance: editingEvent.importance ?? 'MEDIUM',
          }}
          onSave={handleEditSave}
          onCancel={() => setEditingEvent(null)}
        />
      )}
    </div>
  );
}
