import { useEffect, useMemo, useState } from 'react';
import { MARKET_LABEL } from '../../constants';
import {
  AddCategoryModal, EditCategoryModal, DeleteCategoryConfirmModal,
  AssignCategoriesModal, DeleteStockConfirmModal,
} from '../../CategoryModals';
import { BasicInfoModal } from '../../BasicInfoModal';
import { CategoryFilterModal } from '../../CategoryPickerModals';
import { TimelineModal } from '../../TimelineModal';
import { DocumentCenterModal } from '../../DocumentCenterModal';
import { AddStockModal } from '../../AddStockModal';
import { ProfileModal } from '../../ProfileModal';
import { StockTable } from '../../StockTable';
import { FilterSidebar } from '../../FilterSidebar';
import { AppHeader } from '../../AppHeader';
import { computeCategoryCounts, filterStocksByMarketAndStar } from '../../stockFilters';
import {
  deleteStock, setStockCategories, updateStockResearchValue,
  archiveStock, unarchiveStock, getErrorMessage,
  type Stock, type Category,
} from '../../api';
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue';
import { useToast } from '../../shared/ui/feedback/useFeedback';
import { matchesKeyword, type CategoryFilterMode } from './stockQueries';
import { useCategories, useStockCache, useStockList, useStockTimeline } from './useStockData';
import { useCategoryManager } from './useCategoryManager';
import { useBasicInfoEditor } from './useBasicInfoEditor';

const SEARCH_DEBOUNCE_MS = 300;

interface StocksModuleProps {
  onGoHome?: () => void;
  forceArchived?: boolean;
}

export default function StocksModule({ onGoHome, forceArchived }: StocksModuleProps = {}) {
  const toast = useToast();

  // Filter state
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set());
  const [filterMode, setFilterMode] = useState<CategoryFilterMode>('union');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [marketFilters, setMarketFilters] = useState<Set<string>>(new Set()); // empty = show all
  const [starFilter, setStarFilter] = useState<number | null>(null); // null = 全部, 1-5 = 至少N星
  const [showArchived, setShowArchived] = useState(!!forceArchived); // 归档视图
  const debouncedKeyword = useDebouncedValue(searchKeyword, SEARCH_DEBOUNCE_MS);

  const { categories, error: categoriesError } = useCategories();
  const { stocks, error: stocksError } = useStockList({
    archived: showArchived,
    keyword: debouncedKeyword,
    categoryIds: selectedCategoryIds,
    mode: filterMode,
  });
  const { patchStock, removeStock, refreshStocks, refreshCategories } = useStockCache();

  useEffect(() => {
    if (stocksError) toast.error(getErrorMessage(stocksError, '加载股票列表失败'));
  }, [stocksError, toast]);
  useEffect(() => {
    if (categoriesError) toast.error(getErrorMessage(categoriesError, '加载分类失败'));
  }, [categoriesError, toast]);

  const refreshAll = () => {
    void refreshCategories();
    void refreshStocks();
  };

  // Dialogs
  const [showCategoryFilterModal, setShowCategoryFilterModal] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [showAddStock, setShowAddStock] = useState(false);
  const [assignStock, setAssignStock] = useState<Stock | null>(null);
  const [assignedIds, setAssignedIds] = useState<Set<number>>(new Set());
  const [assignSearch, setAssignSearch] = useState('');
  const [pendingDeleteStock, setPendingDeleteStock] = useState<Stock | null>(null);
  const [deletingStock, setDeletingStock] = useState(false);
  const [profileStock, setProfileStock] = useState<Stock | null>(null);
  const [documentStock, setDocumentStock] = useState<Stock | null>(null);
  const [timelineStock, setTimelineStock] = useState<Stock | null>(null);
  const [selectedTimelineDayKey, setSelectedTimelineDayKey] = useState<string | null>(null);

  const timeline = useStockTimeline(timelineStock?.id ?? null);
  useEffect(() => {
    if (timeline.error) toast.error(getErrorMessage(timeline.error, '加载时间线失败'));
  }, [timeline.error, toast]);

  const categoryManager = useCategoryManager({
    categories,
    onChanged: refreshAll,
    onDeleted: id => setSelectedCategoryIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    }),
  });

  const onStockSaved = (updated: Stock) => {
    patchStock(updated);
    if (profileStock?.id === updated.id) setProfileStock(updated);
  };
  const basicInfo = useBasicInfoEditor(onStockSaved);

  const handleSaveAssign = async () => {
    if (!assignStock) return;
    try {
      await setStockCategories(assignStock.id, Array.from(assignedIds));
      setAssignStock(null);
      setAssignSearch('');
      refreshAll();
    } catch (e) {
      toast.error(getErrorMessage(e, '保存分类失败'));
    }
  };

  const handleDeleteStock = async () => {
    if (!pendingDeleteStock) return;
    setDeletingStock(true);
    try {
      await deleteStock(pendingDeleteStock.id);
      setPendingDeleteStock(null);
      removeStock(pendingDeleteStock.id);
      void refreshCategories();
    } catch (e) {
      toast.error(getErrorMessage(e, '删除股票失败'));
    } finally {
      setDeletingStock(false);
    }
  };

  const handleArchiveToggle = async (stock: Stock, archive: boolean) => {
    try {
      await (archive ? archiveStock(stock.id) : unarchiveStock(stock.id));
      removeStock(stock.id);
    } catch (e) {
      toast.error(getErrorMessage(e, archive ? '归档失败' : '恢复失败'));
    }
  };

  const handleSetResearchValue = async (stock: Stock, value: number) => {
    try {
      const res = await updateStockResearchValue(stock.id, value);
      patchStock(res.data);
    } catch (e) {
      toast.error(getErrorMessage(e, '评分保存失败'));
    }
  };

  const openTimeline = (stock: Stock) => {
    setTimelineStock(stock);
    setSelectedTimelineDayKey(null);
  };

  const toggleInSet = <T,>(setter: (fn: (prev: Set<T>) => Set<T>) => void, value: T) =>
    setter(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const categoryCounts = useMemo(() => computeCategoryCounts(stocks), [stocks]);

  const displayedStocks = useMemo(() => {
    const result = filterStocksByMarketAndStar(stocks, marketFilters, starFilter);
    // 归档视图的搜索在已加载的归档股票里做前端过滤（后端搜索只覆盖未归档）
    return showArchived && searchKeyword.trim() ? result.filter(s => matchesKeyword(s, searchKeyword)) : result;
  }, [stocks, marketFilters, starFilter, showArchived, searchKeyword]);

  const { add, edit, remove } = categoryManager;

  return (
    <div className="app-container">
      <AppHeader onGoHome={onGoHome} />

      <main className="main-layout">
        <FilterSidebar
          marketFilters={marketFilters}
          onToggleMarket={m => toggleInSet(setMarketFilters, m)}
          onClearMarkets={() => setMarketFilters(new Set())}
          categories={categories}
          selectedCategoryIds={selectedCategoryIds}
          filterMode={filterMode}
          onFilterModeChange={setFilterMode}
          onOpenCategoryFilter={() => { setShowCategoryFilterModal(true); setCategorySearchQuery(''); }}
          onClearCategories={() => setSelectedCategoryIds(new Set())}
          onAddCategory={add.openAdd}
          starFilter={starFilter}
          onStarFilterChange={setStarFilter}
        />

        <section className="content-area">
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

          <div className="stock-list">
            <StockTable
              stocks={displayedStocks}
              onOpenProfile={setProfileStock}
              onEditBasicInfo={basicInfo.start}
              onSetResearchValue={handleSetResearchValue}
              onAssign={stock => {
                setAssignStock(stock);
                setAssignedIds(new Set(stock.categories?.map(c => c.id) || []));
                setAssignSearch('');
              }}
              onTimeline={openTimeline}
              onDocument={setDocumentStock}
              onDelete={setPendingDeleteStock}
              onArchive={stock => handleArchiveToggle(stock, true)}
              onUnarchive={stock => handleArchiveToggle(stock, false)}
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

      <AddStockModal
        open={showAddStock}
        categories={categories}
        initialCategoryIds={selectedCategoryIds}
        onClose={() => setShowAddStock(false)}
        onCreated={() => void refreshStocks()}
      />

      <CategoryFilterModal
        open={showCategoryFilterModal}
        categories={categories}
        categoryCounts={categoryCounts}
        selectedCategoryIds={selectedCategoryIds}
        filterMode={filterMode}
        searchQuery={categorySearchQuery}
        onSearchChange={setCategorySearchQuery}
        onFilterModeChange={setFilterMode}
        onToggleCategory={id => toggleInSet(setSelectedCategoryIds, id)}
        onClearSelected={() => setSelectedCategoryIds(new Set())}
        onEditCategory={(cat: Category) => { setShowCategoryFilterModal(false); edit.open(cat); }}
        onDeleteCategory={(cat: Category) => { setShowCategoryFilterModal(false); remove.request(cat); }}
        onClose={() => setShowCategoryFilterModal(false)}
      />

      <AddCategoryModal
        open={add.open}
        name={add.name}
        desc={add.desc}
        color={add.color}
        onNameChange={add.setName}
        onDescChange={add.setDesc}
        onColorChange={add.setColor}
        onClose={add.close}
        onConfirm={add.confirm}
      />

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

      <DeleteStockConfirmModal
        pendingDeleteStock={pendingDeleteStock}
        deletingStock={deletingStock}
        onCancel={() => setPendingDeleteStock(null)}
        onConfirm={handleDeleteStock}
      />

      <EditCategoryModal
        editingCategory={edit.category}
        name={edit.name}
        desc={edit.desc}
        color={edit.color}
        onNameChange={edit.setName}
        onDescChange={edit.setDesc}
        onColorChange={edit.setColor}
        onClose={edit.close}
        onSave={edit.save}
        onRequestDelete={remove.request}
      />

      <DeleteCategoryConfirmModal
        pendingDeleteCategory={remove.pending}
        onCancel={remove.cancel}
        onConfirm={remove.confirm}
      />

      {profileStock && (
        <ProfileModal
          key={profileStock.id}
          stock={profileStock}
          onClose={() => setProfileStock(null)}
          onSaved={onStockSaved}
        />
      )}

      <BasicInfoModal
        open={basicInfo.open}
        draft={basicInfo.draft}
        setDraft={basicInfo.setDraft}
        saving={basicInfo.saving}
        onOverlayClose={basicInfo.hide}
        onCancel={basicInfo.cancel}
        onSave={basicInfo.save}
      />

      {documentStock && (
        <DocumentCenterModal
          key={documentStock.id}
          stock={documentStock}
          onClose={() => setDocumentStock(null)}
        />
      )}

      <TimelineModal
        stock={timelineStock}
        loading={timeline.loading}
        entries={timeline.entries}
        selectedDayKey={selectedTimelineDayKey}
        onSelectDay={setSelectedTimelineDayKey}
        onClose={() => setTimelineStock(null)}
      />
    </div>
  );
}