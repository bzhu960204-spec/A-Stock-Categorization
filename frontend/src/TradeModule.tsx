import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useDarkMode } from './useDarkMode';
import { type DocEditorHandle } from './DocEditor';
import CategorySidebar from './CategorySidebar';
import DocRow from './DocRow';
import DocFilterBar from './DocFilterBar';
import DocCategoryPills from './DocCategoryPills';
import DocListToolbar from './DocListToolbar';
import DocEditModal from './DocEditModal';
import DocReadModal from './DocReadModal';
import { printDocument } from './printExport';
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

  // Drag & drop: move a trade onto a category chip
  const [dragTradeId, setDragTradeId] = useState<number | null>(null);

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

  const handleRating = async (trade: Trade, n: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
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

  // ── Drag a trade card onto a folder chip to move it there ──────────────────
  const handleMoveToCategory = async (cat: TradeCategory) => {
    const id = dragTradeId;
    setDragTradeId(null);
    if (id == null) return;
    const trade = trades.find(t => t.id === id);
    if (!trade || trade.categoryId === cat.id) return;
    await updateTrade(trade.id, {
      title: trade.title,
      content: trade.content,
      categoryId: cat.id,
      subCategory: trade.subCategory,
      rating: trade.rating,
    });
    await loadTrades();
  };

  // ── Export PDF ─────────────────────────────────────────────────────────────
  const handleExportPdf = (trade: Trade) => {
    printDocument({
      title: trade.title,
      metaParts: [
        trade.categoryName ? `分类：${trade.categoryName}` : '',
        trade.rating > 0 ? `评星：${'★'.repeat(trade.rating)}${'☆'.repeat(5 - trade.rating)}` : '',
        trade.createdAt ? `录入日期：${new Date(trade.createdAt).toLocaleDateString('zh-CN')}` : '',
      ],
      contentHtml: trade.content,
    });
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
          onDropItem={handleMoveToCategory}
        />

        {/* ── Main ── */}
        <div className="main-content">
          <div className="rp-list-wrap">

            {/* Toolbar */}
            <DocListToolbar
              title={filterLabel()}
              count={search.trim()
                ? (searching ? '…' : `${displayTrades.length} 条`)
                : `${displayTrades.length}/${trades.length} 条`}
            >
              <button className="rp-new-btn" onClick={openNewModal}>+ 新增记录</button>
            </DocListToolbar>

            {/* Search + star filter bar */}
            <DocFilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="全局搜索记录标题 / 内容…"
              starFilter={starFilter}
              onStarFilterChange={setStarFilter}
            />

            {/* Sub-category pills */}
            {!search.trim() && tradeSubCategories.length > 1 && (
              <DocCategoryPills
                options={tradeSubCategories}
                value={subCategoryFilter}
                onChange={setSubCategoryFilter}
              />
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
                  <DocRow
                    key={trade.id}
                    draggable
                    dragging={dragTradeId === trade.id}
                    onDragStart={e => { setDragTradeId(trade.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDragTradeId(null)}
                    onClick={() => openReadModal(trade)}
                    tags={<>
                      {trade.categoryName && (
                        <span className="rp-global-sector-tag">{trade.categoryName}</span>
                      )}
                      {trade.subCategory && (
                        <span className="doc-category-pill active" style={{ fontSize: '0.68rem', padding: '1px 8px' }}>{trade.subCategory}</span>
                      )}
                    </>}
                    title={trade.title}
                    preview={trade.content ? stripHtml(trade.content) : ''}
                    rating={trade.rating}
                    onRate={n => handleRating(trade, n)}
                    date={new Date(trade.createdAt).toLocaleDateString('zh-CN')}
                    actions={
                      <button
                        className="chip-edit-btn"
                        style={{ color: 'var(--danger)', marginLeft: 4 }}
                        title="删除"
                        onClick={e => handleDelete(trade, e)}
                      >✕</button>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Read modal ── */}
      {modalOpen && modalMode === 'read' && modalTrade && (
        <DocReadModal
          title={modalTrade.title}
          categoryTag={modalTrade.categoryName ? <span className="rp-global-sector-tag">{modalTrade.categoryName}</span> : undefined}
          rating={modalTrade.rating}
          onRate={n => handleRating(modalTrade, n)}
          metaTags={<>
            {modalTrade.subCategory && <span className="research-meta-tag">{modalTrade.subCategory}</span>}
            {modalTrade.createdAt && (
              <span className="research-meta-date">{new Date(modalTrade.createdAt).toLocaleDateString('zh-CN')}</span>
            )}
          </>}
          content={modalTrade.content}
          onExportPdf={() => handleExportPdf(modalTrade)}
          onEdit={() => switchToEdit(modalTrade)}
          onClose={closeModal}
        />
      )}

      {/* ── Edit modal ── */}
      {modalOpen && modalMode === 'edit' && (
        <DocEditModal
          titleValue={editTitle}
          onTitleChange={v => { setEditTitle(v); if (saveError) setSaveError(''); }}
          titlePlaceholder="记录标题 *"
          metaFields={<>
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
          </>}
          rating={editRating}
          onRatingChange={setEditRating}
          content={editContent}
          onContentChange={v => { editContentRef.current = v; setEditContent(v); }}
          editorRef={docEditorRef}
          saveLabel="保存记录"
          saving={saving}
          saveError={saveError}
          onSave={handleSave}
          onCancel={() => { if (modalTrade) setModalMode('read'); else closeModal(); }}
          onClose={closeModal}
          onDelete={modalTrade ? () => handleDelete(modalTrade) : undefined}
        />
      )}
    </div>
  );
}

