import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDarkMode } from './useDarkMode';
import { PRESET_COLORS, MARKET_LABEL } from './constants';
import {
  AddCategoryModal, EditCategoryModal, DeleteCategoryConfirmModal,
  AssignCategoriesModal, DeleteStockConfirmModal,
} from './CategoryModals';
import { BasicInfoModal } from './BasicInfoModal';
import { CategoryFilterModal } from './CategoryPickerModals';
import { TimelineModal } from './TimelineModal';
import { DocumentCenterModal } from './DocumentCenterModal';
import { AddStockModal } from './AddStockModal';
import { ProfileModal } from './ProfileModal';
import { StockTable } from './StockTable';
import { FilterSidebar } from './FilterSidebar';
import { AppHeader } from './AppHeader';
import { computeCategoryCounts, filterStocksByMarketAndStar } from './stockFilters';
import {
  getStocks, deleteStock, setStockCategories, updateStock, updateStockResearchValue,
  getCategories, createCategory, updateCategory, deleteCategory,
  filterStocks, searchStocks,
  getStockTimeline,
  getArchivedStocks, archiveStock, unarchiveStock,
  type Stock, type Category, type StockTimelineEntry
} from './api';
import './App.css';


// Resizable image component for document read view
interface AppProps {
  onGoHome?: () => void;
  forceArchived?: boolean;
}

function App({ onGoHome, forceArchived }: AppProps = {}) {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [darkMode, setDarkMode] = useDarkMode();

  // Filter state
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set());
  const [filterMode, setFilterMode] = useState<'union' | 'intersection'>('union');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterKey, setFilterKey] = useState(0);
  const [marketFilters, setMarketFilters] = useState<Set<string>>(new Set()); // empty = show all
  const [starFilter, setStarFilter] = useState<number | null>(null); // null = 全部, 1-5 = 至少N星
  const [showArchived, setShowArchived] = useState(!!forceArchived); // 归档视图

  // Category filter popup modal
  const [showCategoryFilterModal, setShowCategoryFilterModal] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  // Add stock dialog
  const [showAddStock, setShowAddStock] = useState(false);

  // Add category dialog
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(PRESET_COLORS[0]);
  const [newCategoryDesc, setNewCategoryDesc] = useState('');

  // Edit / delete category
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategoryColor, setEditCategoryColor] = useState(PRESET_COLORS[0]);
  const [editCategoryDesc, setEditCategoryDesc] = useState('');
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<Category | null>(null);

  // Assign dialog search
  const [assignSearch, setAssignSearch] = useState('');

  const pickUnusedColor = () => {
    const usedColors = new Set(categories.map(c => c.color));
    const unused = PRESET_COLORS.filter(c => !usedColors.has(c));
    const pool = unused.length > 0 ? unused : PRESET_COLORS;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // Assign categories dialog
  const [assignStock, setAssignStock] = useState<Stock | null>(null);
  const [assignedIds, setAssignedIds] = useState<Set<number>>(new Set());
  const [pendingDeleteStock, setPendingDeleteStock] = useState<Stock | null>(null);
  const [deletingStock, setDeletingStock] = useState(false);

  // Basic info editor
  const [editBasicInfoOpen, setEditBasicInfoOpen] = useState(false);
  const [editBasicInfoStock, setEditBasicInfoStock] = useState<Stock | null>(null);
  const [basicInfoDraft, setBasicInfoDraft] = useState({ name: '', code: '', market: 'CN', recommender: '' });
  const [savingBasicInfo, setSavingBasicInfo] = useState(false);

  // Detail stock
  const [profileStock, setProfileStock] = useState<Stock | null>(null);
  const [timelineStock, setTimelineStock] = useState<Stock | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<StockTimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [selectedTimelineDayKey, setSelectedTimelineDayKey] = useState<string | null>(null);
  const [documentStock, setDocumentStock] = useState<Stock | null>(null);

  const loadData = useCallback(async () => {
    try {
      const catRes = await getCategories();
      setCategories(catRes.data);
      // Re-run the filter effect instead of loading all stocks, so active filters are preserved.
      setFilterKey(k => k + 1);
    } catch (e) {
      console.error('Failed to load data', e);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter logic
  useEffect(() => {
    const doFilter = async () => {
      try {
        if (showArchived) {
          const res = await getArchivedStocks();
          setStocks(res.data);
          return;
        }
        if (searchKeyword.trim()) {
          const res = await searchStocks(searchKeyword);
          let results = res.data;
          if (selectedCategoryIds.size > 0) {
            results = results.filter(stock => {
              const stockCatIds = new Set(stock.categories.map(c => c.id));
              return filterMode === 'intersection'
                ? Array.from(selectedCategoryIds).every(id => stockCatIds.has(id))
                : Array.from(selectedCategoryIds).some(id => stockCatIds.has(id));
            });
          }
          setStocks(results);
        } else if (selectedCategoryIds.size > 0) {
          const res = await filterStocks(Array.from(selectedCategoryIds), filterMode);
          setStocks(res.data);
        } else {
          const res = await getStocks();
          setStocks(res.data);
        }
      } catch (e) {
        console.error('Filter failed', e);
      }
    };
    const timer = setTimeout(doFilter, 300);
    return () => clearTimeout(timer);
  }, [selectedCategoryIds, filterMode, searchKeyword, filterKey, showArchived]);

  const openEditBasicInfo = (stock: Stock) => {
    setEditBasicInfoStock(stock);
    setBasicInfoDraft({
      name: stock.name,
      code: stock.code,
      market: stock.market || 'CN',
      recommender: stock.recommender || '',
    });
    setEditBasicInfoOpen(true);
  };

  const handleSaveBasicInfo = async () => {
    if (!editBasicInfoStock) return;
    setSavingBasicInfo(true);
    try {
      const { categories: _cats, ...stockWithoutCategories } = editBasicInfoStock;
      const res = await updateStock(editBasicInfoStock.id, { ...stockWithoutCategories, ...basicInfoDraft });
      setStocks(prev => prev.map(s => s.id === res.data.id ? res.data : s));
      if (profileStock?.id === res.data.id) setProfileStock(res.data);
      setEditBasicInfoOpen(false);
      setEditBasicInfoStock(null);
    } catch (e) {
      console.error('Failed to save basic info', e);
    } finally {
      setSavingBasicInfo(false);
    }
  };

  const openProfileEditor = (stock: Stock) => {
    setProfileStock(stock);
  };

  // Add category
  const handleAddCategory = async () => {
    if (!newCategoryName) return;
    try {
      await createCategory({ name: newCategoryName, color: newCategoryColor, description: newCategoryDesc.trim() || undefined });
      setShowAddCategory(false);
      setNewCategoryName('');
      setNewCategoryDesc('');
      setNewCategoryColor(pickUnusedColor());
      loadData();
    } catch (e) {
      console.error('Failed to add category', e);
    }
  };

  const openEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setEditCategoryName(cat.name);
    setEditCategoryColor(cat.color || PRESET_COLORS[0]);
    setEditCategoryDesc(cat.description || '');
  };

  const handleSaveEditCategory = async () => {
    if (!editingCategory || !editCategoryName.trim()) return;
    try {
      await updateCategory(editingCategory.id, {
        name: editCategoryName.trim(),
        color: editCategoryColor,
        description: editCategoryDesc.trim() || undefined,
      });
      setEditingCategory(null);
      loadData();
    } catch (e) {
      console.error('Failed to update category', e);
    }
  };

  const handleDeleteCategoryConfirmed = async () => {
    if (!pendingDeleteCategory) return;
    try {
      await deleteCategory(pendingDeleteCategory.id);
      setSelectedCategoryIds(prev => {
        const next = new Set(prev);
        next.delete(pendingDeleteCategory.id);
        return next;
      });
      setPendingDeleteCategory(null);
      setEditingCategory(null);
      loadData();
    } catch (e) {
      console.error('Failed to delete category', e);
    }
  };

  // Save assigned categories
  const handleSaveAssign = async () => {
    if (!assignStock) return;
    try {
      await setStockCategories(assignStock.id, Array.from(assignedIds));
      setAssignStock(null);
      setAssignSearch('');
      loadData();
    } catch (e) {
      console.error('Failed to assign categories', e);
    }
  };

  // Delete stock
  const handleDeleteStock = async () => {
    if (!pendingDeleteStock) return;
    setDeletingStock(true);
    try {
      await deleteStock(pendingDeleteStock.id);
      setPendingDeleteStock(null);
      await loadData();
    } catch (e) {
      console.error('Failed to delete stock', e);
    } finally {
      setDeletingStock(false);
    }
  };

  const handleArchiveStock = async (stock: Stock) => {
    try {
      await archiveStock(stock.id);
      setStocks(prev => prev.filter(s => s.id !== stock.id));
    } catch (e) {
      console.error('Failed to archive stock', e);
    }
  };

  const handleUnarchiveStock = async (stock: Stock) => {
    try {
      await unarchiveStock(stock.id);
      setStocks(prev => prev.filter(s => s.id !== stock.id));
    } catch (e) {
      console.error('Failed to unarchive stock', e);
    }
  };

  const openTimeline = async (stock: Stock) => {
    setTimelineStock(stock);
    setTimelineEntries([]);
    setSelectedTimelineDayKey(null);
    setTimelineLoading(true);
    try {
      const res = await getStockTimeline(stock.id);
      setTimelineEntries(res.data);
    } catch (e) {
      console.error('Failed to load timeline', e);
      setTimelineEntries([]);
    } finally {
      setTimelineLoading(false);
    }
  };

  // Toggle category filter
  const toggleCategoryFilter = (id: number) => {
    setSelectedCategoryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const categoryCounts = useMemo(() => computeCategoryCounts(stocks), [stocks]);

  const toggleMarket = (m: string) => {
    setMarketFilters(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  const displayedStocks = useMemo(() => {
    let result = filterStocksByMarketAndStar(stocks, marketFilters, starFilter);
    // 归档视图的搜索在已加载的归档股票里做前端过滤（后端搜索只覆盖未归档）
    if (showArchived && searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      result = result.filter(s =>
        s.code.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw),
      );
    }
    return result;
  }, [stocks, marketFilters, starFilter, showArchived, searchKeyword]);

  return (
    <div className="app-container">
      {/* Header */}
      <AppHeader onGoHome={onGoHome} darkMode={darkMode} onToggleDarkMode={() => setDarkMode(!darkMode)} />

      <main className="main-layout">
        {/* Sidebar */}
        <FilterSidebar
          marketFilters={marketFilters}
          onToggleMarket={toggleMarket}
          onClearMarkets={() => setMarketFilters(new Set())}
          categories={categories}
          selectedCategoryIds={selectedCategoryIds}
          filterMode={filterMode}
          onFilterModeChange={setFilterMode}
          onOpenCategoryFilter={() => { setShowCategoryFilterModal(true); setCategorySearchQuery(''); }}
          onClearCategories={() => setSelectedCategoryIds(new Set())}
          onAddCategory={() => { setShowAddCategory(true); setNewCategoryColor(pickUnusedColor()); setNewCategoryDesc(''); }}
          starFilter={starFilter}
          onStarFilterChange={setStarFilter}
        />

        {/* Content */}
        <section className="content-area">
          {/* Toolbar */}
          <div className="glass-toolbar">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="搜索股票代码或名称..."
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
              />
              {searchKeyword && (
                <button type="button" className="clear-btn" onClick={() => setSearchKeyword('')}>×</button>
              )}
            </div>
            <button
              type="button"
              className={`add-btn ${showArchived ? 'archive-active' : 'archive-toggle'}`}
              onClick={() => setShowArchived(v => !v)}
              title={showArchived ? '返回正常列表' : '查看归档'}
            >
              {showArchived ? '← 返回列表' : '📥 已归档'}
            </button>
            {!showArchived && (
              <button type="button" className="add-btn" onClick={() => setShowAddStock(true)}>
                + 添加股票
              </button>
            )}
          </div>

          {/* Stock list */}
          <div className="stock-list">
            <StockTable
              stocks={displayedStocks}
              onOpenProfile={openProfileEditor}
              onEditBasicInfo={openEditBasicInfo}
              onSetResearchValue={async (stock, newVal) => {
                try {
                  const res = await updateStockResearchValue(stock.id, newVal);
                  setStocks(prev => prev.map(s => s.id === stock.id ? res.data : s));
                } catch (e) { console.error(e); }
              }}
              onAssign={stock => {
                setAssignStock(stock);
                setAssignedIds(new Set(stock.categories?.map(c => c.id) || []));
                setAssignSearch('');
              }}
              onTimeline={openTimeline}
              onDocument={setDocumentStock}
              onDelete={setPendingDeleteStock}
              onArchive={handleArchiveStock}
              onUnarchive={handleUnarchiveStock}
              archivedView={showArchived}
            />
          </div>

          <div className="stock-count">
            {showArchived && <span className="stock-count-market">归档区 · </span>}
            共 {displayedStocks.length} 只
            {marketFilters.size > 0 && <span className="stock-count-market">（{Array.from(marketFilters).map(m => MARKET_LABEL[m] || m).join('+')}）</span>}
          </div>
        </section>
      </main>

      {/* Add Stock Modal */}
      <AddStockModal
        open={showAddStock}
        categories={categories}
        initialCategoryIds={selectedCategoryIds}
        onClose={() => setShowAddStock(false)}
        onCreated={() => setFilterKey(k => k + 1)}
      />

      {/* Category Filter Modal */}
      <CategoryFilterModal
        open={showCategoryFilterModal}
        categories={categories}
        categoryCounts={categoryCounts}
        selectedCategoryIds={selectedCategoryIds}
        filterMode={filterMode}
        searchQuery={categorySearchQuery}
        onSearchChange={setCategorySearchQuery}
        onFilterModeChange={setFilterMode}
        onToggleCategory={toggleCategoryFilter}
        onClearSelected={() => setSelectedCategoryIds(new Set())}
        onEditCategory={cat => { setShowCategoryFilterModal(false); openEditCategory(cat); }}
        onDeleteCategory={cat => { setShowCategoryFilterModal(false); setPendingDeleteCategory(cat); }}
        onClose={() => setShowCategoryFilterModal(false)}
      />

      {/* Add Category Modal */}
      <AddCategoryModal
        open={showAddCategory}
        name={newCategoryName}
        desc={newCategoryDesc}
        color={newCategoryColor}
        onNameChange={setNewCategoryName}
        onDescChange={setNewCategoryDesc}
        onColorChange={setNewCategoryColor}
        onClose={() => { setShowAddCategory(false); setNewCategoryName(''); setNewCategoryDesc(''); }}
        onConfirm={handleAddCategory}
      />

      {/* Assign Categories Modal */}
      <AssignCategoriesModal
        assignStock={assignStock}
        categories={categories}
        assignedIds={assignedIds}
        setAssignedIds={setAssignedIds}
        assignSearch={assignSearch}
        onSearchChange={setAssignSearch}
        onClose={() => { setAssignStock(null); setAssignSearch(''); }}
        onSave={handleSaveAssign}
      />

      {/* Delete Confirm Modal */}
      <DeleteStockConfirmModal
        pendingDeleteStock={pendingDeleteStock}
        deletingStock={deletingStock}
        onCancel={() => setPendingDeleteStock(null)}
        onConfirm={handleDeleteStock}
      />

      {/* Edit Category Modal */}
      <EditCategoryModal
        editingCategory={editingCategory}
        name={editCategoryName}
        desc={editCategoryDesc}
        color={editCategoryColor}
        onNameChange={setEditCategoryName}
        onDescChange={setEditCategoryDesc}
        onColorChange={setEditCategoryColor}
        onClose={() => setEditingCategory(null)}
        onSave={handleSaveEditCategory}
        onRequestDelete={setPendingDeleteCategory}
      />

      {/* Delete Category Confirm */}
      <DeleteCategoryConfirmModal
        pendingDeleteCategory={pendingDeleteCategory}
        onCancel={() => setPendingDeleteCategory(null)}
        onConfirm={handleDeleteCategoryConfirmed}
      />

      {/* Company Profile Modal */}
      {profileStock && (
        <ProfileModal
          key={profileStock.id}
          stock={profileStock}
          onClose={() => setProfileStock(null)}
          onSaved={updated => {
            setStocks(prev => prev.map(s => s.id === updated.id ? updated : s));
            setProfileStock(updated);
          }}
        />
      )}

      {/* Basic Info Edit Modal */}
      <BasicInfoModal
        open={editBasicInfoOpen && !!editBasicInfoStock}
        draft={basicInfoDraft}
        setDraft={setBasicInfoDraft}
        saving={savingBasicInfo}
        onOverlayClose={() => setEditBasicInfoOpen(false)}
        onCancel={() => { setEditBasicInfoOpen(false); setEditBasicInfoStock(null); }}
        onSave={handleSaveBasicInfo}
      />

      {/* Document Modal */}
      {documentStock && (
        <DocumentCenterModal
          key={documentStock.id}
          stock={documentStock}
          onClose={() => setDocumentStock(null)}
        />
      )}

      {/* Timeline Modal */}
      <TimelineModal
        stock={timelineStock}
        loading={timelineLoading}
        entries={timelineEntries}
        selectedDayKey={selectedTimelineDayKey}
        onSelectDay={setSelectedTimelineDayKey}
        onClose={() => setTimelineStock(null)}
      />
    </div>
  );
}

export default App;
