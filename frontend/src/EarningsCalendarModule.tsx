import { useState, useEffect, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import { DocEditor } from './DocEditor';
import { useEscapeKey } from './useEscapeKey';
import {
  getEarningsCalendar, getEarningsNote, saveEarningsNote, earningsRefreshStreamUrl,
  getErrorMessage, type EarningsEntry, type EarningsCalendarData,
} from './api';
import './EarningsCalendarModule.css';

const WEEKDAYS_CN = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS_CN = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function pad(n: number) { return n < 10 ? '0' + n : '' + n; }
function toDateStr(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

function formatDateCN(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 (周${WEEKDAYS_CN[d.getDay()]})`;
}

// ── badges ──────────────────────────────────────────────────────────────────

function TimingBadge({ time, confirmed }: { time: string; confirmed: boolean }) {
  let cls = 'ec-badge-tbd';
  if (time === '盘前') cls = 'ec-badge-pre';
  else if (time === '盘后') cls = 'ec-badge-post';
  return (
    <>
      <span className={`ec-badge ${cls}`}>{time}</span>
      {!confirmed && <span className="ec-badge ec-badge-est">Est.</span>}
    </>
  );
}

function ResultBadge({ item }: { item: EarningsEntry }) {
  const isPast = new Date(item.entryDate + 'T00:00:00') < new Date();
  if (!item.reported) {
    if (isPast) return <span className="ec-badge ec-badge-reported">已发布</span>;
    return null;
  }
  const forecast = parseFloat((item.epsForecast || '').replace('$', ''));
  const actual = parseFloat((item.epsActual || '').replace('$', ''));
  if (isNaN(actual)) return <span className="ec-badge ec-badge-reported">已发布</span>;
  if (isNaN(forecast)) return <span className="ec-badge ec-badge-reported">已公布 {item.epsActual}</span>;
  return actual >= forecast
    ? <span className="ec-badge ec-badge-beat">EPS Beat</span>
    : <span className="ec-badge ec-badge-miss">EPS Miss</span>;
}

// ── HTML 新页面预览 ───────────────────────────────────────────────────────────

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// 阅读模式：固定白底深字，专注长文阅读，不跟随 App 主题。
const PREVIEW_STYLE = `
  :root { color-scheme: light; --bg:#ffffff; --fg:#1f2328; --fg2:#57606a; --accent:#0969da; --accent2:#116329; --border:#d0d7de; --stripe:#f6f8fa; }
  * { box-sizing: border-box; }
  html { background:var(--bg); }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:'Inter',-apple-system,'Segoe UI',sans-serif; font-size:17px; line-height:1.85; -webkit-font-smoothing:antialiased; }
  .doc { max-width:720px; margin:0 auto; padding:56px 28px 96px; }
  .doc h1 { font-size:1.7rem; margin:1.2em 0 .4em; line-height:1.35; }
  .doc h2 { font-size:1.35rem; margin:1.1em 0 .35em; border-bottom:1px solid var(--border); padding-bottom:6px; line-height:1.4; }
  .doc h3 { font-size:1.12rem; margin:.9em 0 .3em; }
  .doc p { margin:.85em 0; }
  .doc a { color:var(--accent); }
  .doc strong { font-weight:700; }
  .doc em { color:var(--accent2); }
  .doc code { background:var(--stripe); color:#cf222e; padding:1px 6px; border-radius:4px; font-family:'JetBrains Mono',monospace; font-size:.88em; }
  .doc pre { background:var(--stripe); padding:14px 16px; border-radius:8px; overflow-x:auto; border:1px solid var(--border); }
  .doc pre code { background:none; padding:0; color:var(--fg); }
  .doc blockquote { margin:.9em 0; padding:.4em 1em; border-left:3px solid var(--accent); color:var(--fg2); }
  .doc ul,.doc ol { padding-left:1.5em; }
  .doc li { margin:.35em 0; }
  .doc hr { border:none; border-top:1px solid var(--border); margin:1.6em 0; }
  .doc img { max-width:100%; border-radius:6px; }
  .doc table { border-collapse:collapse; width:100%; margin:1em 0; }
  .doc th,.doc td { border:1px solid var(--border); padding:6px 10px; text-align:left; }
  .doc th { background:var(--stripe); }
  .doc tr:nth-child(even) td { background:var(--stripe); }
`;

/** 把笔记 HTML 包成独立文档，在新标签页打开（固定白底阅读模式）。 */
function openHtmlPreview(title: string, html: string) {
  const body = html && html.trim() ? html : '<p><em>（空）</em></p>';
  const doc = `<!DOCTYPE html><html data-theme="light"><head>`
    + `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${escapeHtml(title)}</title><style>${PREVIEW_STYLE}</style></head>`
    + `<body><article class="doc">${body}</article></body></html>`;
  const url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
    alert('浏览器拦截了新窗口，请允许本站的弹出窗口后重试');
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ── note modal ──────────────────────────────────────────────────────────────

interface NoteModalProps {
  ticker: string;
  date: string;
  onClose: () => void;
}

function NoteModal({ ticker, date, onClose }: NoteModalProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [full, setFull] = useState(false);
  const [error, setError] = useState('');

  useEscapeKey(() => { if (!full) onClose(); });

  useEffect(() => {
    let alive = true;
    getEarningsNote(ticker, date)
      .then(res => {
        if (!alive) return;
        const raw = res.data.content || '';
        // 兼容旧的 Markdown 笔记：非 HTML 内容先转成 HTML 再交给富文本编辑器。
        const html = raw && !/^\s*</.test(raw) ? (marked.parse(raw) as string) : raw;
        setContent(html);
      })
      .catch(() => { /* 无笔记视为空 */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ticker, date]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await saveEarningsNote(ticker, date, content);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const titleText = `${ticker} · ${date} 财报笔记`;

  return (
    <div className={`ec-modal-overlay${full ? ' ec-modal-overlay--full' : ''}`} onClick={() => { if (!full) onClose(); }}>
      <div className={`ec-modal${full ? ' ec-modal--full' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="ec-modal-header">
          <span>{titleText}</span>
          <div className="ec-modal-header-actions">
            <button className="cal-btn cal-btn-ghost cal-btn-sm" onClick={() => openHtmlPreview(titleText, content)} title="在新标签页以 HTML 预览">🔗 新页面预览</button>
            <button className="cal-btn cal-btn-ghost cal-btn-sm" onClick={() => setFull(f => !f)} title={full ? '退出全屏' : '全屏编辑'}>{full ? '⤡ 退出全屏' : '⤢ 全屏'}</button>
            <button className="cal-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="ec-modal-body">
          {loading ? (
            <div className="ec-note-loading">加载中…</div>
          ) : (
            <div className="ec-note-editor-wrap">
              <DocEditor value={content} onChange={setContent} />
            </div>
          )}
        </div>
        {error && <div className="ec-modal-err">{error}</div>}
        <div className="ec-modal-actions">
          <button className="cal-btn cal-btn-ghost" onClick={onClose}>取消</button>
          <button className="cal-btn cal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── main module ─────────────────────────────────────────────────────────────

interface EarningsCalendarModuleProps {
  onGoHome: () => void;
}

interface Progress { active: boolean; pct: number; text: string; sub: string; }

export default function EarningsCalendarModule({ onGoHome }: EarningsCalendarModuleProps) {
  const today = new Date();
  const [data, setData] = useState<EarningsCalendarData>({ calendar: {}, monthsFetched: {}, watchlist: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeSectors, setActiveSectors] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Progress>({ active: false, pct: 0, text: '', sub: '' });
  const [fetching, setFetching] = useState(false);
  const [note, setNote] = useState<{ ticker: string; date: string } | null>(null);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getEarningsCalendar();
      setData({
        calendar: res.data.calendar || {},
        monthsFetched: res.data.monthsFetched || {},
        watchlist: res.data.watchlist || [],
      });
    } catch (err) {
      setError(getErrorMessage(err, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  // 首次加载后自动选中今天或之后最近有数据的日期（限当月）
  useEffect(() => {
    if (loading) return;
    const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
    const dates = Object.keys(data.calendar).sort();
    const nearest = dates.find(d => d >= todayStr);
    if (nearest) {
      const d = new Date(nearest + 'T00:00:00');
      if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) {
        setSelectedDate(nearest);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const monthKey = `${currentYear}-${pad(currentMonth + 1)}`;
  const fetchedAt = data.monthsFetched[monthKey];

  const filterBySector = useCallback((entries: EarningsEntry[]) =>
    activeSectors.size === 0 ? entries : entries.filter(e => activeSectors.has(e.sector)),
    [activeSectors]);

  const monthSectors = useMemo(() => {
    const sectors = new Set<string>();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = toDateStr(currentYear, currentMonth, d);
      for (const e of (data.calendar[dateStr] || [])) {
        if (e.sector && e.sector !== '—') sectors.add(e.sector);
      }
    }
    return [...sectors].sort();
  }, [data.calendar, currentYear, currentMonth]);

  const toggleSector = (sector: string) => {
    setActiveSectors(prev => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector); else next.add(sector);
      return next;
    });
  };

  const changeMonth = (delta: number) => {
    let m = currentMonth + delta;
    let y = currentYear;
    if (m < 0) { m = 11; y--; }
    else if (m > 11) { m = 0; y++; }
    setCurrentMonth(m);
    setCurrentYear(y);
    setSelectedDate(null);
    setActiveSectors(new Set());
  };

  const goToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDate(null);
    setActiveSectors(new Set());
  };

  // ── SSE 拉取本月数据 ──
  const fetchCurrentMonth = () => {
    if (fetching) return;
    setFetching(true);
    setProgress({ active: true, pct: 0, text: '正在连接…', sub: '' });
    const month = currentMonth + 1;
    const source = new EventSource(earningsRefreshStreamUrl(currentYear, month));

    source.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.status === 'start') {
        setProgress({ active: true, pct: 0, text: `正在拉取 ${currentYear}年${month}月 财报数据…`, sub: `共 ${msg.total} 个交易日` });
      } else if (msg.status === 'progress') {
        const pct = Math.round((msg.processed / msg.total) * 100);
        const foundMsg = msg.found > 0 ? `，找到 ${msg.found} 家大盘股` : '';
        setProgress({ active: true, pct, text: `已处理 ${msg.processed} / ${msg.total} 个交易日`, sub: `当前日期: ${msg.date}${foundMsg}` });
      } else if (msg.status === 'done') {
        source.close();
        setProgress({ active: true, pct: 100, text: `✓ 拉取完成，共 ${msg.totalFound} 家大盘股财报`, sub: '' });
        const result = msg.result || {};
        setData({
          calendar: result.calendar || {},
          monthsFetched: result.monthsFetched || {},
          watchlist: result.watchlist || [],
        });
        setTimeout(() => {
          setProgress(p => ({ ...p, active: false }));
          setFetching(false);
        }, 2000);
      }
    };

    source.onerror = () => {
      source.close();
      setProgress({ active: false, pct: 0, text: '', sub: '' });
      setFetching(false);
      setError('拉取失败，请重试');
    };
  };

  // ── 渲染网格 ──
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const selectedEntries = selectedDate ? filterBySector(data.calendar[selectedDate] || []) : [];

  return (
    <div className="ec-root">
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome}>← 返回</button>
          <h1 className="app-title">财报日历</h1>
        </div>
        <div className="header-right">
          <button className="cal-btn cal-btn-ghost" onClick={loadCalendar} disabled={loading || fetching}>↻ 刷新</button>
          <button className="cal-btn cal-btn-primary" onClick={fetchCurrentMonth} disabled={fetching}>
            {fetching ? '拉取中…' : '⬇ 拉取本月数据'}
          </button>
        </div>
      </header>

      <div className="ec-content">
        {loading ? (
          <div className="ec-loading">加载中…</div>
        ) : (
          <>
            {/* 进度条 */}
            {progress.active && (
              <div className="ec-progress-box">
                <div className="ec-progress-label">
                  <span>{progress.text}</span>
                  <span className="ec-progress-pct">{progress.pct}%</span>
                </div>
                <div className="ec-progress-track">
                  <div className="ec-progress-fill" style={{ width: `${progress.pct}%` }} />
                </div>
                <div className="ec-progress-sub">{progress.sub}</div>
              </div>
            )}

            {error && <div className="ec-error">{error}<button onClick={loadCalendar}>重试</button></div>}

            {/* 月份导航 */}
            <div className="ec-month-nav">
              <button onClick={() => changeMonth(-1)}>‹ 上月</button>
              <span className="ec-month-label">{currentYear}年 {MONTHS_CN[currentMonth]}</span>
              <button onClick={() => changeMonth(1)}>下月 ›</button>
              <button onClick={goToday}>今天</button>
            </div>
            <div className="ec-month-status">
              {fetchedAt
                ? <span className="ec-fetched">✓ 已拉取 · 更新于 {new Date(fetchedAt).toLocaleString('zh-CN')}</span>
                : <span className="ec-not-fetched">⚠ 本月尚未拉取数据，点击「拉取本月数据」获取</span>}
            </div>

            {/* 板块过滤 */}
            {monthSectors.length > 0 && (
              <div className="ec-sector-filter">
                <span className="ec-sector-label">板块:</span>
                <span
                  className={`ec-sector-pill${activeSectors.size === 0 ? ' active' : ''}`}
                  onClick={() => setActiveSectors(new Set())}
                >全部</span>
                {monthSectors.map(s => (
                  <span
                    key={s}
                    className={`ec-sector-pill${activeSectors.has(s) ? ' active' : ''}`}
                    onClick={() => toggleSector(s)}
                  >{s}</span>
                ))}
              </div>
            )}

            {/* 日历网格 */}
            <div className="ec-grid">
              {WEEKDAYS_CN.map(w => <div key={w} className="ec-weekday">{w}</div>)}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} className="ec-cell ec-cell-empty" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const dateStr = toDateStr(currentYear, currentMonth, d);
                const dow = new Date(currentYear, currentMonth, d).getDay();
                const isWeekend = dow === 0 || dow === 6;
                const isToday = dateStr === todayStr;
                const entries = filterBySector(data.calendar[dateStr] || []);
                const hasEarnings = entries.length > 0;
                const isSelected = dateStr === selectedDate;

                let cls = 'ec-cell';
                if (isWeekend && !hasEarnings) cls += ' ec-weekend';
                if (hasEarnings) cls += ' ec-has-earnings';
                if (isToday) cls += ' ec-today';
                if (isSelected) cls += ' ec-selected';

                return (
                  <div
                    key={dateStr}
                    className={cls}
                    onClick={hasEarnings ? () => setSelectedDate(dateStr === selectedDate ? null : dateStr) : undefined}
                  >
                    <div className="ec-day-num">{d}</div>
                    {hasEarnings && (
                      <>
                        <span className="ec-cell-count">{entries.length}</span>
                        <div className="ec-cell-tickers">
                          {entries.slice(0, 3).map(e => (
                            <span key={e.id} className="ec-cell-ticker">{e.ticker}</span>
                          ))}
                        </div>
                        {entries.length > 3 && <div className="ec-cell-more">+{entries.length - 3} 更多</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 详情面板 */}
            {selectedDate && selectedEntries.length > 0 && (
              <div className="ec-detail-panel">
                <div className="ec-detail-header">
                  <span className="ec-detail-title">📋 {formatDateCN(selectedDate)} — 共 {selectedEntries.length} 家公司</span>
                  <button className="cal-modal-close" onClick={() => setSelectedDate(null)}>✕</button>
                </div>
                <div className="ec-detail-list">
                  {selectedEntries.map(item => {
                    const epsInfo = item.reported
                      ? `EPS实际 ${item.epsActual} (预估 ${item.epsForecast || '—'})${item.surprise ? ' · Surprise ' + item.surprise : ''}`
                      : `EPS预估 ${item.epsForecast || '—'}`;
                    const isPast = new Date(item.entryDate + 'T00:00:00') < new Date();
                    const showTiming = !((item.reported || isPast) && item.reportTime === '未公布');
                    return (
                      <div key={item.id} className="ec-detail-item">
                        <div className="ec-item-ticker">{item.ticker}</div>
                        <div className="ec-item-info">
                          <div className="ec-item-name" title={item.name}>{item.name}</div>
                          <div className="ec-item-meta">市值 {item.marketCap} · 分析师 {item.numEstimates}人 · {epsInfo}</div>
                        </div>
                        <div className="ec-item-badges">
                          <ResultBadge item={item} />
                          {item.sector && item.sector !== '—' && <span className="ec-badge ec-badge-sector">{item.sector}</span>}
                          {showTiming && <TimingBadge time={item.reportTime} confirmed={item.confirmed} />}
                          {item.sp500 && <span className="ec-badge ec-badge-sp500">S&P 500</span>}
                        </div>
                        <button
                          className="ec-note-btn"
                          title="记录笔记"
                          onClick={() => setNote({ ticker: item.ticker, date: item.entryDate })}
                        >📝</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {note && <NoteModal ticker={note.ticker} date={note.date} onClose={() => setNote(null)} />}
    </div>
  );
}
