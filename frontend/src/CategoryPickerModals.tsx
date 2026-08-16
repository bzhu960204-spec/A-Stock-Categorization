import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type { Category } from './api';

interface NewStockCategoryPickerModalProps {
  open: boolean;
  categories: Category[];
  selectedIds: Set<number>;
  setSelectedIds: Dispatch<SetStateAction<Set<number>>>;
  search: string;
  onSearchChange: (v: string) => void;
  onClear: () => void;
  onConfirm: () => void;
  onOverlayClose: () => void;
}

export function NewStockCategoryPickerModal({
  open, categories, selectedIds, setSelectedIds, search, onSearchChange, onClear, onConfirm, onOverlayClose,
}: NewStockCategoryPickerModalProps) {
  if (!open) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onOverlayClose}>
      <div className="glass-modal assign-modal" onClick={e => e.stopPropagation()}>
        <div className="assign-modal-header">
          <h2>选择分类</h2>
          {selectedIds.size > 0 && (
            <span className="assign-modal-stock">已选 {selectedIds.size} 个</span>
          )}
        </div>
        {categories.length > 5 && (
          <div className="assign-search-box">
            <input
              className="assign-search-input"
              type="text"
              placeholder="搜索分类…"
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              autoFocus
            />
          </div>
        )}
        <div className="assign-tag-cloud">
          {categories
            .filter(cat =>
              !search ||
              cat.name.toLowerCase().includes(search.toLowerCase()) ||
              (cat.description || '').toLowerCase().includes(search.toLowerCase())
            )
            .map(cat => {
              const selected = selectedIds.has(cat.id);
              return (
                <button
                  key={cat.id}
                  className={`assign-tag ${selected ? 'selected' : ''}`}
                  style={{ '--cat-color': cat.color || '#6366f1' } as CSSProperties}
                  title={cat.description || ''}
                  onClick={() => setSelectedIds(prev => {
                    const next = new Set(prev);
                    if (next.has(cat.id)) next.delete(cat.id); else next.add(cat.id);
                    return next;
                  })}
                >
                  <span className="assign-tag-dot" />
                  <span>{cat.name}</span>
                  {selected && <span className="assign-tag-check">✓</span>}
                </button>
              );
            })}
        </div>
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClear}>清空</button>
          <button className="confirm-btn" onClick={onConfirm}>确定</button>
        </div>
      </div>
    </div>
  );
}

interface CategoryFilterModalProps {
  open: boolean;
  categories: Category[];
  categoryCounts: Map<number, number>;
  selectedCategoryIds: Set<number>;
  filterMode: 'union' | 'intersection';
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onFilterModeChange: (mode: 'union' | 'intersection') => void;
  onToggleCategory: (id: number) => void;
  onClearSelected: () => void;
  onEditCategory: (cat: Category) => void;
  onDeleteCategory: (cat: Category) => void;
  onClose: () => void;
}

export function CategoryFilterModal({
  open, categories, categoryCounts, selectedCategoryIds, filterMode, searchQuery,
  onSearchChange, onFilterModeChange, onToggleCategory, onClearSelected, onEditCategory, onDeleteCategory, onClose,
}: CategoryFilterModalProps) {
  if (!open) return null;
  const matches = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (cat.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-modal cat-filter-modal" onClick={e => e.stopPropagation()}>
        <div className="cat-filter-modal-header">
          <span className="cat-filter-modal-title">分类筛选</span>
          <div className="cat-filter-modal-modes">
            <button
              className={`mode-btn ${filterMode === 'union' ? 'active' : ''}`}
              onClick={() => onFilterModeChange('union')}
              title="包含任意一个选中的分类"
            >任一</button>
            <button
              className={`mode-btn ${filterMode === 'intersection' ? 'active' : ''}`}
              onClick={() => onFilterModeChange('intersection')}
              title="同时包含所有选中的分类"
            >全部</button>
          </div>
          <button className="cat-filter-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="cat-filter-modal-search">
          <input
            type="text"
            className="cat-filter-search-input"
            placeholder="搜索分类…"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button className="cat-filter-search-clear" onClick={() => onSearchChange('')}>✕</button>
          )}
        </div>
        <div className="cat-filter-modal-list">
          {matches.map(cat => {
            const count = categoryCounts.get(cat.id) || 0;
            const isSelected = selectedCategoryIds.has(cat.id);
            return (
              <div key={cat.id} className="cat-filter-modal-row">
                <button
                  className={`category-chip ${isSelected ? 'selected' : ''}`}
                  style={{ '--chip-color': cat.color || '#6366f1' } as CSSProperties}
                  onClick={() => onToggleCategory(cat.id)}
                  title={cat.description || cat.name}
                >
                  <span className="chip-dot" />
                  <span className="chip-name">{cat.name}</span>
                  {count > 0 && <span className="chip-count">{count}</span>}
                </button>
                <div className="cat-filter-row-actions">
                  <button
                    className="cat-row-action-btn edit"
                    onClick={() => onEditCategory(cat)}
                    title="编辑分类"
                  >✎</button>
                  <button
                    className="cat-row-action-btn delete"
                    onClick={() => onDeleteCategory(cat)}
                    title="删除分类"
                  >🗑</button>
                </div>
              </div>
            );
          })}
          {matches.length === 0 && (
            <p className="empty-hint" style={{ padding: '16px' }}>无匹配分类</p>
          )}
        </div>
        <div className="cat-filter-modal-footer">
          {selectedCategoryIds.size > 0
            ? <span className="filter-active-label">已选 {selectedCategoryIds.size} 个</span>
            : <span className="filter-active-label">共 {categories.length} 个分类</span>
          }
          <div style={{ display: 'flex', gap: 8 }}>
            {selectedCategoryIds.size > 0 && (
              <button className="clear-filter-btn" onClick={onClearSelected}>清除</button>
            )}
            <button className="confirm-btn" onClick={onClose}>完成</button>
          </div>
        </div>
      </div>
    </div>
  );
}
