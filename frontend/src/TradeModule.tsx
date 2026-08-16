import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useDarkMode } from './useDarkMode';
import { DocEditor, type DocEditorHandle } from './DocEditor';
import CategorySidebar from './CategorySidebar';
import {
  getTradeCategories, createTradeCategory, updateTradeCategory, deleteTradeCategory,
  getTrades, searchTrades, createTrade, updateTrade, updateTradeRating, deleteTrade,
  type TradeCategory, type Trade,
} from './api';
import './App.css';

interface TradeModuleProps {
  onGoHome: () => void;
}

export default function TradeModule({ onGoHome }: TradeModuleProps) {
  const [darkMode, setDarkMode] = useDarkMode();
  const [categories, setCategories] = useState<TradeCategory[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  // Sidebar filter: null = all, number = category id
  const [filter, setFilter] = useState<null | number>(null);

  // Star filter: 0 = all, 1-5 = at least N stars
  const [starFilter, setStarFilter] = useState(0);


  // Search
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Trade[]>([]);
  const [searching, setSearching] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'read' | 'edit'>('read');
  const [modalTrade, setModalTrade] = useState<Trade | null>(null);

  // Edit form
  const [editTitle, setEditTitle] = useState('');
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editSubCategory, setEditSubCategory] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editRating, setEditRating] = useState(0);

  // Sub-category filter (within selected folder)
  const [subCategoryFilter, setSubCategoryFilter] = useState('全部');
  const editContentRef = useRef('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const docEditorRef = useRef<DocEditorHandle>(null);


  // ── ESC closes modal (blocked in edit mode to prevent data loss) ──────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalOpen && modalMode !== 'edit') closeModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalOpen, modalMode]);

  // ── Load categories ───────────────────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    const res = await getTradeCategories();
    setCategories(res.data);
  }, []);
  useEffect(() => { loadCategories(); }, [loadCategories]);

  // ── Load trades ────────────────────────────────────────────────────────────
  const loadTrades = useCallback(async () => {
    setLoading(true);
    setSubCategoryFilter('全部'); // reset sub-filter when folder changes
    try {
      const res = typeof filter === 'number'
        ? await getTrades({ categoryId: filter })
        : await getTrades();
      setTrades(res.data);
    } finally {
      setLoading(false);
    }
  }, [filter]);
  useEffect(() => { loadTrades(); }, [loadTrades]);

  // ── Debounced global search ───────────────────────────────────────────────
  useEffect(() => {
    const kw = search.trim();
    if (!kw) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchTrades(kw);
        setSearchResults(res.data);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Displayed list (star filter applied client-side) ────────────────────
  const tradeSubCategories = useMemo(() =>
    ['全部', ...Array.from(new Set(trades.map(t => t.subCategory).filter((c): c is string => !!c)))],
    [trades]
  );

  const displayTrades = useMemo(() => {
    let list = search.trim() ? searchResults : trades;
    if (subCategoryFilter !== '全部') list = list.filter(t => (t.subCategory || '') === subCategoryFilter);
    if (starFilter > 0) list = list.filter(t => t.rating >= starFilter);
    return list;
  }, [trades, search, searchResults, starFilter, subCategoryFilter]);

  // ── Category CRUD ─────────────────────────────────────────────────────────
  const handleAddCat = async (name: string) => {
    await createTradeCategory({ name });
    await loadCategories();
  };

  const handleUpdateCat = async (id: number, name: string) => {
    await updateTradeCategory(id, { name });
    await loadCategories();
  };

  const handleDeleteCat = async (cat: TradeCategory) => {
    if (!window.confirm(`确定删除分类「${cat.name}」？该分类下有记录时无法删除。`)) return;
    try {
      await deleteTradeCategory(cat.id);
      if (filter === cat.id) setFilter(null);
      await loadCategories();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        alert(`无法删除「${cat.name}」，请先移除该分类下的所有交易记录。`);
      } else {
        alert('删除失败，请重试。');
      }
    }
  };

  // ── Modal ─────────────────────────────────────────────────────────────────
  const closeModal = () => {
    setModalOpen(false);
    setModalTrade(null);
    setSaveError('');
  };

  const openReadModal = (trade: Trade) => {
    setModalTrade(trade);
    setModalMode('read');
    setModalOpen(true);
  };

  const openNewModal = () => {
    setModalTrade(null);
    setEditTitle('');
    setEditCategoryName(
      typeof filter === 'number' ? (categories.find(c => c.id === filter)?.name ?? '') : ''
    );
    setEditSubCategory(subCategoryFilter !== '全部' ? subCategoryFilter : '');
    setEditContent('');
    editContentRef.current = '';
    setEditRating(0);
    setSaveError('');
    setModalMode('edit');
    setModalOpen(true);
  };

  const switchToEdit = (trade: Trade) => {
    setEditTitle(trade.title);
    setEditCategoryName(trade.categoryName ?? '');
    setEditSubCategory(trade.subCategory ?? '');
    setEditContent(trade.content || '');
    editContentRef.current = trade.content || '';
    setEditRating(trade.rating ?? 0);
    setSaveError('');
    setModalMode('edit');
  };

  const handleSave = async () => {
    if (!editTitle.trim()) { setSaveError('请填写记录标题'); return; }
    setSaving(true);
    setSaveError('');
    try {
      let categoryId: number | null = null;
      const catName = editCategoryName.trim();
      if (catName) {
        const existing = categories.find(c => c.name === catName);
        if (existing) {
          categoryId = existing.id;
        } else {
          const res = await createTradeCategory({ name: catName });
          categoryId = res.data.id;
          await loadCategories();
        }
      }
      const payload = {
        title: editTitle.trim(),
        content: editContentRef.current,
        categoryId,
        subCategory: editSubCategory.trim() || undefined,
        rating: editRating,
      };
      let saved: Trade;
      if (!modalTrade) {
        const res = await createTrade(payload);
        saved = res.data;
      } else {
        const res = await updateTrade(modalTrade.id, payload);
        saved = res.data;
      }
      await loadTrades();
      setModalTrade(saved);
      setModalMode('read');
    } catch {
      setSaveError('保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (trade: Trade, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm(`确定删除「${trade.title}」？`)) return;
    await deleteTrade(trade.id);
    await loadTrades();
    if (modalTrade?.id === trade.id) closeModal();
  };

  const handleRating = async (trade: Trade, n: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newRating = trade.rating === n ? 0 : n;
    try {
      const res = await updateTradeRating(trade.id, newRating);
      setTrades(prev => prev.map(t => t.id === trade.id ? res.data : t));
      if (modalTrade?.id === trade.id) setModalTrade(res.data);
    } catch (err) { console.error(err); }
  };

  const stripHtml = (html: string) =>
    html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

  const filterLabel = () => {
    if (filter === null) return '全部记录';
    const cat = categories.find(c => c.id === filter);
    return cat ? cat.name : '全部记录';
  };

  // ── Export PDF ─────────────────────────────────────────────────────────────
  const handleExportPdf = (trade: Trade) => {
    const stars = '★'.repeat(trade.rating) + '☆'.repeat(5 - trade.rating);
    const metaParts = [
      trade.categoryName ? `分类：${trade.categoryName}` : '',
      trade.rating > 0 ? `评星：${stars}` : '',
      trade.createdAt ? `录入日期：${new Date(trade.createdAt).toLocaleDateString('zh-CN')}` : '',
    ].filter(Boolean).join('　|　');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${trade.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "PingFang SC","Microsoft YaHei","SimSun",sans-serif; font-size: 14px; color: #1a1a1a; background: #fff; padding: 40px 48px; }
    .trade-title { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
    .trade-meta { font-size: 12px; color: #666; border-bottom: 1px solid #e0e0e0; padding-bottom: 10px; margin-bottom: 24px; }
    .trade-content { line-height: 1.8; }
    .trade-content p { margin-bottom: .8em; }
    .trade-content h1,.trade-content h2,.trade-content h3 { margin: 1em 0 .5em; font-weight: 600; }
    .trade-content ul,.trade-content ol { margin: .5em 0 .8em 1.5em; }
    .trade-content li { margin-bottom: .3em; }
    .trade-content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    .trade-content th,.trade-content td { border: 1px solid #ccc; padding: 6px 10px; font-size: 13px; }
    .trade-content th { background: #f5f5f5; font-weight: 600; }
    .trade-content blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #555; margin: .8em 0; }
    @media print { @page { size: A4; margin: 20mm 18mm; } }
  </style>
</head>
<body>
  <div class="trade-title">${trade.title}</div>
  <div class="trade-meta">${metaParts}</div>
  <div class="trade-content">${trade.content || '<p>（无内容）</p>'}</div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };<\/script>
</body>
</html>`;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome} title="返回主页">⌂</button>
          <h1 className="app-title">交易记录</h1>
        </div>
        <div className="header-right">
          <button className="icon-btn" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? 'LITE' : 'TERM'}
          </button>
        </div>
      </header>

      <main className="main-layout">
        {/* ── Sidebar ── */}
        <CategorySidebar
          categories={categories}
          filter={filter}
          onSelect={(id) => { setFilter(id); setSearch(''); }}
          onAdd={handleAddCat}
          onUpdate={handleUpdateCat}
          onDelete={handleDeleteCat}
        />

        {/* ── Main ── */}
        <div className="main-content">
          <div className="rp-list-wrap">

            {/* Toolbar */}
            <div className="rp-toolbar">
              <span className="rp-toolbar-title">{filterLabel()}</span>
              <span className="rp-toolbar-count">
                {search.trim()
                  ? (searching ? '…' : `${displayTrades.length} 条`)
                  : `${displayTrades.length}/${trades.length} 条`}
              </span>
              <div style={{ flex: 1 }} />
              <button className="rp-new-btn" onClick={openNewModal}>+ 新增记录</button>
            </div>

            {/* Search + star filter bar */}
            <div className="rp-filter-bar">
              <div className="rp-search-wrap">
                <input
                  className="rp-search-input"
                  placeholder="全局搜索记录标题 / 内容…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="rp-scope-toggle"
                    onClick={() => setSearch('')}
                    title="清空搜索"
                  >✕</button>
                )}
              </div>
              <div className="rp-star-filters">
                {[0, 1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    className={`rp-star-filter-btn${starFilter === n ? ' active' : ''}`}
                    onClick={() => setStarFilter(n)}
                    title={n === 0 ? '全部' : `${n}星及以上`}
                  >
                    {n === 0 ? '全部' : '★'.repeat(n)}
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-category pills */}
            {!search.trim() && tradeSubCategories.length > 1 && (
              <div className="doc-category-pills">
                {tradeSubCategories.map(cat => (
                  <button
                    key={cat}
                    className={`doc-category-pill${subCategoryFilter === cat ? ' active' : ''}`}
                    onClick={() => setSubCategoryFilter(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* List */}
            {loading && !search.trim() ? (
              <div className="research-empty-state">加载中…</div>
            ) : searching ? (
              <div className="research-empty-state">搜索中…</div>
            ) : displayTrades.length === 0 ? (
              <div className="research-empty-state">
                {search.trim() ? '无匹配记录' : '点击「+ 新增记录」开始记录'}
              </div>
            ) : (
              <div className="rp-list">
                {displayTrades.map(trade => (
                  <div key={trade.id} className="rp-row" onClick={() => openReadModal(trade)}>
                    <div className="rp-row-main">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {trade.categoryName && (
                          <span className="rp-global-sector-tag">{trade.categoryName}</span>
                        )}
                        {trade.subCategory && (
                          <span className="doc-category-pill active" style={{ fontSize: '0.68rem', padding: '1px 8px' }}>{trade.subCategory}</span>
                        )}
                        <span className="rp-row-title">{trade.title}</span>
                      </div>
                      {trade.content && (
                        <span className="rp-row-preview">{stripHtml(trade.content)}</span>
                      )}
                    </div>
                    <div className="rp-row-right">
                      <div className="rp-row-stars" onClick={e => e.stopPropagation()}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <span
                            key={n}
                            className={`star-btn${trade.rating >= n ? ' filled' : ''}`}
                            onClick={e => handleRating(trade, n, e)}
                            title={`评为 ${n} 星`}
                          >
                            {trade.rating >= n ? '★' : '☆'}
                          </span>
                        ))}
                      </div>
                      <span className="rp-row-date">
                        {new Date(trade.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                      <button
                        className="chip-edit-btn"
                        style={{ color: 'var(--danger)', marginLeft: 4 }}
                        title="删除"
                        onClick={e => handleDelete(trade, e)}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Modal ── */}
      {modalOpen && (
        <div className="rp-modal-overlay" onClick={() => { if (modalMode !== 'edit') closeModal(); }}>
          <div className="rp-modal" onClick={e => e.stopPropagation()}>

            <div className="rp-modal-header">
              {modalMode === 'read' ? (
                <>
                  <div className="rp-modal-header-left">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {modalTrade?.categoryName && (
                        <span className="rp-global-sector-tag">{modalTrade.categoryName}</span>
                      )}
                      <span className="rp-modal-title-display">{modalTrade?.title}</span>
                    </div>
                    <div className="rp-modal-meta">
                      <div className="star-rating-inline" onClick={e => e.stopPropagation()}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <span
                            key={n}
                            className={`star-btn${(modalTrade?.rating ?? 0) >= n ? ' filled' : ''}`}
                            onClick={e => modalTrade && handleRating(modalTrade, n, e)}
                            title={`设为 ${n} 星`}
                          >
                            {(modalTrade?.rating ?? 0) >= n ? '★' : '☆'}
                          </span>
                        ))}
                      </div>
                      {modalTrade?.subCategory && (
                        <span className="research-meta-tag">{modalTrade.subCategory}</span>
                      )}
                      {modalTrade?.createdAt &&
                        <span className="research-meta-date">{new Date(modalTrade.createdAt).toLocaleDateString('zh-CN')}</span>}
                    </div>
                  </div>
                  <div className="rp-modal-header-right">
                    <button className="icon-btn" onClick={() => modalTrade && handleExportPdf(modalTrade)}>
                      ⬇ 导出PDF
                    </button>
                    <button className="icon-btn" onClick={() => modalTrade && switchToEdit(modalTrade)}>
                      ✎ 编辑
                    </button>
                    <button className="icon-btn" onClick={closeModal}>✕ 关闭</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rp-modal-header-left rp-modal-edit-meta">
                    <input
                      className="rp-modal-title-input"
                      placeholder="记录标题 *"
                      value={editTitle}
                      onChange={e => { setEditTitle(e.target.value); if (saveError) setSaveError(''); }}
                      autoFocus
                    />
                    <div className="rp-modal-meta-inputs">
                      <input
                        className="rp-modal-meta-input"
                        placeholder="文件夹分类（可直接输入新分类名）"
                        list="trade-category-list"
                        value={editCategoryName}
                        onChange={e => setEditCategoryName(e.target.value)}
                      />
                      <datalist id="trade-category-list">
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.name} />
                        ))}
                      </datalist>
                      <input
                        className="rp-modal-meta-input"
                        placeholder="子分类（如：成功 / 失败 / 错过…）"
                        list="trade-subcategory-list"
                        value={editSubCategory}
                        onChange={e => setEditSubCategory(e.target.value)}
                      />
                      <datalist id="trade-subcategory-list">
                        {tradeSubCategories.filter(c => c !== '全部').map(c => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                      <div className="star-rating-inline">
                        {[1, 2, 3, 4, 5].map(n => (
                          <span
                            key={n}
                            className={`star-btn${editRating >= n ? ' filled' : ''}`}
                            onClick={() => setEditRating(prev => prev === n ? 0 : n)}
                            title={`评为 ${n} 星`}
                          >
                            {editRating >= n ? '★' : '☆'}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="rp-modal-header-right">
                    {saveError && <span className="doc-save-error">{saveError}</span>}
                    {modalTrade && (
                      <button className="cancel-btn" style={{ color: 'var(--danger)' }}
                        onClick={() => handleDelete(modalTrade)} disabled={saving}>删除</button>
                    )}
                    <button className="cancel-btn"
                      onClick={() => { if (modalTrade) setModalMode('read'); else closeModal(); }}
                      disabled={saving}>取消</button>
                    <button className="confirm-btn" onClick={handleSave} disabled={saving}>
                      {saving ? '保存中…' : '保存记录'}
                    </button>
                    <button className="icon-btn" onClick={closeModal}>✕</button>
                  </div>
                </>
              )}
            </div>

            <div className="rp-modal-body">
              {modalMode === 'read' ? (
                <div className="rp-modal-read-content doc-read-view">
                  <DocEditor value={modalTrade?.content || ''} onChange={() => {}} readonly />
                </div>
              ) : (
                <div className="rp-modal-editor-wrap">
                  <DocEditor
                    ref={docEditorRef}
                    value={editContent}
                    onChange={v => { editContentRef.current = v; setEditContent(v); }}
                  />
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
