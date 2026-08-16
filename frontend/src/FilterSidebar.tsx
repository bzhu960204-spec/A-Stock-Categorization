import { useState } from 'react';
import { KNOWN_MARKETS, MARKET_LABEL } from './constants';
import type { Category } from './api';

interface FilterSidebarProps {
  marketFilters: Set<string>;
  onToggleMarket: (m: string) => void;
  onClearMarkets: () => void;
  categories: Category[];
  selectedCategoryIds: Set<number>;
  filterMode: 'union' | 'intersection';
  onFilterModeChange: (mode: 'union' | 'intersection') => void;
  onOpenCategoryFilter: () => void;
  onClearCategories: () => void;
  onAddCategory: () => void;
  starFilter: number | null;
  onStarFilterChange: (v: number | null) => void;
}

interface CollapsibleSectionProps {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

function CollapsibleSection({ title, badge, children }: Readonly<CollapsibleSectionProps>) {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => setCollapsed(c => !c);
  return (
    <div className="sidebar-section">
      <div
        className="section-header section-header-collapsible"
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
      >
        <h3>
          {title}
          {badge}
        </h3>
        <span className="collapse-chevron">{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed && children}
    </div>
  );
}

export function FilterSidebar({
  marketFilters, onToggleMarket, onClearMarkets,
  categories, selectedCategoryIds, filterMode, onFilterModeChange,
  onOpenCategoryFilter, onClearCategories, onAddCategory,
  starFilter, onStarFilterChange,
}: Readonly<FilterSidebarProps>) {
  return (
    <aside className="glass-sidebar">
      {/* Market filter — multi-select, collapsible */}
      <CollapsibleSection
        title="市场"
        badge={marketFilters.size > 0 ? <span className="filter-badge">{marketFilters.size}</span> : null}
      >
        <div className="market-filter-group-multi">
          {KNOWN_MARKETS.map(m => (
            <button
              type="button"
              key={m}
              className={`market-filter-chip ${marketFilters.has(m) ? 'active' : ''}`}
              onClick={() => onToggleMarket(m)}
            >
              {MARKET_LABEL[m]}
            </button>
          ))}
        </div>
        {marketFilters.size > 0 && (
          <div className="sidebar-filter-footer" style={{ paddingTop: 6 }}>
            <span className="filter-active-label">已选 {marketFilters.size} 个</span>
            <button type="button" className="clear-filter-btn" onClick={onClearMarkets}>清除</button>
          </div>
        )}
      </CollapsibleSection>

      {/* Category filter — popup modal */}
      <div className="sidebar-section">
        <div className="section-header">
          <h3>
            分类标签
            {selectedCategoryIds.size > 0 && <span className="filter-badge">{selectedCategoryIds.size}</span>}
          </h3>
          <div className="section-header-right">
            <button type="button" className="small-btn" onClick={onAddCategory}>+</button>
          </div>
        </div>
        <div className="cat-filter-trigger-area">
          <button
            type="button"
            className={`cat-filter-trigger-btn ${selectedCategoryIds.size > 0 ? 'has-selection' : ''}`}
            onClick={onOpenCategoryFilter}
          >
            {selectedCategoryIds.size === 0
              ? <span className="cft-placeholder">点击选择分类…</span>
              : <span className="cft-tags">
                  {Array.from(selectedCategoryIds).slice(0, 3).map(id => {
                    const cat = categories.find(c => c.id === id);
                    if (!cat) return null;
                    return (
                      <span key={id} className="cft-tag" style={{ '--chip-color': cat.color || '#6366f1' } as React.CSSProperties}>
                        <span className="cft-tag-dot" />
                        {cat.name}
                      </span>
                    );
                  })}
                  {selectedCategoryIds.size > 3 && <span className="cft-more">+{selectedCategoryIds.size - 3}</span>}
                </span>
            }
            <span className="cft-icon">⊞</span>
          </button>
          {selectedCategoryIds.size > 0 && (
            <button type="button" className="cft-clear-btn" onClick={onClearCategories} title="清除筛选">✕</button>
          )}
        </div>
        {selectedCategoryIds.size > 0 && (
          <div className="cat-filter-mode-row">
            <button
              type="button"
              className={`mode-btn ${filterMode === 'union' ? 'active' : ''}`}
              onClick={() => onFilterModeChange('union')}
              title="包含任意一个选中的分类"
            >任一</button>
            <button
              type="button"
              className={`mode-btn ${filterMode === 'intersection' ? 'active' : ''}`}
              onClick={() => onFilterModeChange('intersection')}
              title="同时包含所有选中的分类"
            >全部</button>
          </div>
        )}
      </div>

      {/* Star rating filter — collapsible, below categories */}
      <CollapsibleSection
        title="研究价值"
        badge={starFilter !== null ? <span className="filter-badge">{'★'.repeat(starFilter)}</span> : null}
      >
        <div className="star-filter-group">
          <button
            type="button"
            className={`star-filter-btn ${starFilter === null ? 'active' : ''}`}
            onClick={() => onStarFilterChange(null)}
          >全部</button>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              type="button"
              key={n}
              className={`star-filter-btn ${starFilter === n ? 'active' : ''}`}
              onClick={() => onStarFilterChange(starFilter === n ? null : n)}
              title={`至少 ${n} 星`}
            >
              {'★'.repeat(n)}{'☆'.repeat(5 - n)}
            </button>
          ))}
        </div>
      </CollapsibleSection>
    </aside>
  );
}
