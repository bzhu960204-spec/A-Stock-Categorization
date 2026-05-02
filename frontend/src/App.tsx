import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  getStocks, createStock, deleteStock, setStockCategories, updateStock,
  getCategories, createCategory, updateCategory, deleteCategory,
  filterStocks, searchStocks, lookupStock, lookupStockSuggest, lookupUsStock, lookupUsStockSuggest,
  getStockTimeline, getStockDocuments, createStockDocument, updateStockDocument, deleteStockDocument,
  type Stock, type Category, type LookupSuggestion, type StockTimelineEntry, type StockDocument
} from './api';
import './App.css';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#64748b', '#a855f7',
];

type AutoResizeTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
};

function AutoResizeTextarea({ value, className, ...props }: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;

    element.style.height = '0px';
    element.style.height = `${Math.max(element.scrollHeight, 110)}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      className={["profile-textarea", className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

function groupEntriesByDay(entries: StockTimelineEntry[]) {
  const map = new Map<string, StockTimelineEntry[]>();
  for (const e of entries) {
    const dt = new Date(e.createdAt);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entries]) => ({ key, entries }));
}

function App() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [darkMode, setDarkMode] = useState(false);

  // Filter state
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set());
  const [filterMode, setFilterMode] = useState<'union' | 'intersection'>('union');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [marketFilter, setMarketFilter] = useState<'all' | 'CN' | 'US'>('all');

  // Add stock dialog
  const [showAddStock, setShowAddStock] = useState(false);
  const [newStockMarket, setNewStockMarket] = useState<'CN' | 'US'>('CN');
  const [newStockCode, setNewStockCode] = useState('');
  const [newStockName, setNewStockName] = useState('');
  const [newStockNotes, setNewStockNotes] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [codeSuggestions, setCodeSuggestions] = useState<LookupSuggestion[]>([]);
  const [nameSuggestions, setNameSuggestions] = useState<LookupSuggestion[]>([]);
  const [activeSuggestField, setActiveSuggestField] = useState<'code' | 'name' | null>(null);

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

  // Detail stock
  const [profileStock, setProfileStock] = useState<Stock | null>(null);
  const [profileMode, setProfileMode] = useState<'read' | 'edit'>('read');
  const [profileActiveSection, setProfileActiveSection] = useState('business');
  const [savingProfile, setSavingProfile] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonImportText, setJsonImportText] = useState('');
  const [jsonImportError, setJsonImportError] = useState('');
  const [timelineStock, setTimelineStock] = useState<Stock | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<StockTimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [selectedTimelineDayKey, setSelectedTimelineDayKey] = useState<string | null>(null);
  const [documentStock, setDocumentStock] = useState<Stock | null>(null);
  const [documents, setDocuments] = useState<StockDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [docViewMode, setDocViewMode] = useState<'list' | 'read' | 'edit' | 'compose'>('list');
  const [selectedDocument, setSelectedDocument] = useState<StockDocument | null>(null);
  const [editDocTitle, setEditDocTitle] = useState('');
  const [editDocContent, setEditDocContent] = useState('');
  const [savingDocument, setSavingDocument] = useState(false);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<StockDocument | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    notes: '',
    business: '',
    customers: '',
    competitors: '',
    strengths: '',
    structuralWeaknesses: '',
    future: '',
    founderCeoHolding: '',
  });

  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const tlDrag = useRef({ active: false, startX: 0, scrollLeft: 0 });

  const loadData = useCallback(async () => {
    try {
      const [stockRes, catRes] = await Promise.all([getStocks(), getCategories()]);
      setStocks(stockRes.data);
      setCategories(catRes.data);
    } catch (e) {
      console.error('Failed to load data', e);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Filter logic
  useEffect(() => {
    const doFilter = async () => {
      try {
        if (searchKeyword.trim()) {
          const res = await searchStocks(searchKeyword);
          setStocks(res.data);
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
  }, [selectedCategoryIds, filterMode, searchKeyword]);

  // Lookup stock
  const handleLookup = async (value: string, field: 'code' | 'name') => {
    if (!value.trim()) return;
    setLookingUp(true);
    try {
      const res = newStockMarket === 'US'
        ? await lookupUsStock(value)
        : await lookupStock(value);
      if (!res.data.error) {
        if (field === 'code') setNewStockName(res.data.name);
        else setNewStockCode(res.data.code);
      }
    } catch { /* ignore */ }
    setLookingUp(false);
  };

  useEffect(() => {
    if (!showAddStock) return;

    const trimmedCode = newStockCode.trim();
    if (trimmedCode.length < 2) {
      setCodeSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = newStockMarket === 'US'
          ? await lookupUsStockSuggest(trimmedCode, 8)
          : await lookupStockSuggest(trimmedCode, 8);
        setCodeSuggestions(res.data);
      } catch {
        setCodeSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [newStockCode, showAddStock, newStockMarket]);

  useEffect(() => {
    if (!showAddStock) return;

    const trimmedName = newStockName.trim();
    if (trimmedName.length < 1) {
      setNameSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = newStockMarket === 'US'
          ? await lookupUsStockSuggest(trimmedName, 8)
          : await lookupStockSuggest(trimmedName, 8);
        setNameSuggestions(res.data);
      } catch {
        setNameSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [newStockName, showAddStock, newStockMarket]);

  const handleChooseSuggestion = (item: LookupSuggestion) => {
    setNewStockCode(item.code);
    setNewStockName(item.name);
    setCodeSuggestions([]);
    setNameSuggestions([]);
    setActiveSuggestField(null);
  };

  const openProfileEditor = (stock: Stock) => {
    const legacyCombined = stock.strengthsWeaknessesLegacy || '';
    setProfileStock(stock);
    setProfileMode('read');
    setProfileActiveSection('business');
    setShowJsonImport(false);
    setJsonImportText('');
    setJsonImportError('');
    setProfileDraft({
      notes: stock.notes || '',
      business: stock.business || '',
      customers: stock.customers || '',
      competitors: stock.competitors || '',
      strengths: stock.strengths || legacyCombined,
      structuralWeaknesses: stock.structuralWeaknesses || '',
      future: stock.future || '',
      founderCeoHolding: stock.founderCeoHolding || '',
    });
  };

  const profileSections = [
    { key: 'business',            title: '业务',           placeholder: '记录公司主营业务、业务结构、业务变化...',               value: profileDraft.business },
    { key: 'customers',           title: '客户',           placeholder: '记录核心客户、集中度、议价能力...',                     value: profileDraft.customers },
    { key: 'competitors',         title: '竞争对手',       placeholder: '记录主要竞争对手、市场格局...',                         value: profileDraft.competitors },
    { key: 'strengths',           title: '竞争优势',       placeholder: '记录护城河、成本优势、渠道能力、品牌与生态壁垒...',     value: profileDraft.strengths },
    { key: 'structuralWeaknesses',title: '结构性弱点',     placeholder: '记录商业模式或行业位置中的长期弱点、脆弱点...',         value: profileDraft.structuralWeaknesses },
    { key: 'founderCeoHolding',   title: '创始人/CEO持股', placeholder: '记录创始人/CEO 控制权与持股结构...',                    value: profileDraft.founderCeoHolding },
    { key: 'future',              title: '面向未来',       placeholder: '记录公司顺应未来变化在做什么，例如 AI、出海、技术路线...', value: profileDraft.future },
    { key: 'notes',               title: '补充备注',       placeholder: '其它补充信息...',                                      value: profileDraft.notes },
  ];

  const applyJsonToProfileDraft = () => {
    try {
      const parsed = JSON.parse(jsonImportText || '{}');
      const source = parsed?.companyProfile && typeof parsed.companyProfile === 'object'
        ? parsed.companyProfile
        : parsed;

      const formatImportedText = (value: string) =>
        value
          .replace(/([;；。：:])\s*/g, '$1\n')
          .replace(/\n{2,}/g, '\n')
          .trim();

      const pick = (...keys: string[]) => {
        for (const key of keys) {
          const value = source?.[key];
          if (typeof value === 'string') return formatImportedText(value);
        }
        return '';
      };

      setProfileDraft(prev => ({
        ...prev,
        business: pick('business', '业务') || prev.business,
        customers: pick('customers', '客户') || prev.customers,
        competitors: pick('competitors', '竞争对手') || prev.competitors,
        strengths: pick('strengths', '竞争优势') || prev.strengths,
        structuralWeaknesses: pick('structuralWeaknesses', '结构性弱点') || prev.structuralWeaknesses,
        future: pick('future', '面向未来') || prev.future,
        founderCeoHolding: pick('founderCeoHolding', '创始人CEO及持股') || prev.founderCeoHolding,
        notes: pick('notes', '补充备注', '备注') || prev.notes,
      }));

      setJsonImportError('');
      setShowJsonImport(false);
      setJsonImportText('');
    } catch {
      setJsonImportError('JSON 解析失败，请检查格式。');
    }
  };

  const handleSaveProfile = async () => {
    if (!profileStock) return;
    setSavingProfile(true);
    try {
      const res = await updateStock(profileStock.id, {
        code: profileStock.code,
        name: profileStock.name,
        ...profileDraft,
      });
      setProfileStock(res.data);
      setProfileMode('read');
      setProfileDraft({
        notes: res.data.notes || '',
        business: res.data.business || '',
        customers: res.data.customers || '',
        competitors: res.data.competitors || '',
        strengths: res.data.strengths || res.data.strengthsWeaknessesLegacy || '',
        structuralWeaknesses: res.data.structuralWeaknesses || '',
        future: res.data.future || '',
        founderCeoHolding: res.data.founderCeoHolding || '',
      });
      await loadData();
    } catch (e) {
      console.error('Failed to save company profile', e);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelEdit = () => {
    if (!profileStock) return;
    setProfileMode('read');
    setProfileDraft({
      notes: profileStock.notes || '',
      business: profileStock.business || '',
      customers: profileStock.customers || '',
      competitors: profileStock.competitors || '',
      strengths: profileStock.strengths || profileStock.strengthsWeaknessesLegacy || '',
      structuralWeaknesses: profileStock.structuralWeaknesses || '',
      future: profileStock.future || '',
      founderCeoHolding: profileStock.founderCeoHolding || '',
    });
  };

  // Add stock
  const handleAddStock = async () => {
    if (!newStockCode || !newStockName) return;
    try {
      await createStock({ code: newStockCode, name: newStockName, notes: newStockNotes, market: newStockMarket });
      setShowAddStock(false);
      setNewStockCode('');
      setNewStockName('');
      setNewStockNotes('');
      setNewStockMarket('CN');
      setCodeSuggestions([]);
      setNameSuggestions([]);
      setActiveSuggestField(null);
      loadData();
    } catch (e) {
      console.error('Failed to add stock', e);
    }
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

  const openDocumentCenter = async (stock: Stock) => {
    setDocumentStock(stock);
    setDocuments([]);
    setDocViewMode('list');
    setSelectedDocument(null);
    setEditDocTitle('');
    setEditDocContent('');
    setPendingDeleteDoc(null);
    setDocumentsLoading(true);
    try {
      const res = await getStockDocuments(stock.id);
      setDocuments(res.data);
    } catch (e) {
      console.error('Failed to load stock documents', e);
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  };

  const handleAddDocument = async () => {
    if (!documentStock) return;
    const title = editDocTitle.trim();
    const content = editDocContent.trim();
    if (!title || !content) return;

    setSavingDocument(true);
    try {
      const res = await createStockDocument(documentStock.id, { title, content });
      setDocuments(prev => [res.data, ...prev]);
      setEditDocTitle('');
      setEditDocContent('');
      setDocViewMode('list');
    } catch (e) {
      console.error('Failed to create stock document', e);
    } finally {
      setSavingDocument(false);
    }
  };

  const handleUpdateDocument = async () => {
    if (!documentStock || !selectedDocument) return;
    const title = editDocTitle.trim();
    const content = editDocContent.trim();
    if (!title || !content) return;

    setSavingDocument(true);
    try {
      const res = await updateStockDocument(documentStock.id, selectedDocument.id, { title, content });
      setDocuments(prev => prev.map(d => d.id === res.data.id ? res.data : d));
      setSelectedDocument(res.data);
      setDocViewMode('read');
    } catch (e) {
      console.error('Failed to update document', e);
    } finally {
      setSavingDocument(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!documentStock || !pendingDeleteDoc) return;
    setSavingDocument(true);
    try {
      await deleteStockDocument(documentStock.id, pendingDeleteDoc.id);
      setDocuments(prev => prev.filter(d => d.id !== pendingDeleteDoc.id));
      setPendingDeleteDoc(null);
      setSelectedDocument(null);
      setDocViewMode('list');
    } catch (e) {
      console.error('Failed to delete document', e);
    } finally {
      setSavingDocument(false);
    }
  };

  const actionTypeLabelMap: Record<string, string> = {
    CREATE: '新增',
    UPDATE: '编辑',
    CATEGORY: '分类',
    DELETE: '删除',
    DOCUMENT: '文档',
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

  const groupedTimelineDays = groupEntriesByDay(timelineEntries);
  const selectedDayData = selectedTimelineDayKey
    ? (groupedTimelineDays.find(d => d.key === selectedTimelineDayKey) ?? null)
    : null;

  const categoryCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of stocks) {
      for (const c of s.categories || []) {
        map.set(c.id, (map.get(c.id) || 0) + 1);
      }
    }
    return map;
  }, [stocks]);

  const displayedStocks = useMemo(() => {
    if (marketFilter === 'all') return stocks;
    return stocks.filter(s => (s.market || 'CN') === marketFilter);
  }, [stocks, marketFilter]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="glass-header">
        <div className="header-left">
          <h1 className="app-title">Stock Info</h1>
        </div>
        <div className="header-right">
          <button className="icon-btn" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? 'LITE' : 'TERM'}
          </button>
        </div>
      </header>

      <main className="main-layout">
        {/* Sidebar */}
        <aside className="glass-sidebar">
          {/* Market filter */}
          <div className="sidebar-section">
            <div className="section-header"><h3>市场</h3></div>
            <div className="market-filter-group">
              {(['all', 'CN', 'US'] as const).map(m => (
                <button
                  key={m}
                  className={`market-filter-btn ${marketFilter === m ? 'active' : ''}`}
                  onClick={() => setMarketFilter(m)}
                >
                  {m === 'all' ? '全部' : m === 'CN' ? 'A股' : '美股'}
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-header">
              <h3>分类标签</h3>
              <button className="small-btn" onClick={() => { setShowAddCategory(true); setNewCategoryColor(pickUnusedColor()); setNewCategoryDesc(''); }}>+</button>
            </div>
            <div className="filter-mode">
              <button
                className={`mode-btn ${filterMode === 'union' ? 'active' : ''}`}
                onClick={() => setFilterMode('union')}
                title="包含任意一个选中的分类"
              >任一</button>
              <button
                className={`mode-btn ${filterMode === 'intersection' ? 'active' : ''}`}
                onClick={() => setFilterMode('intersection')}
                title="同时包含所有选中的分类"
              >全部</button>
            </div>
            <div className="category-list">
              {categories.map(cat => {
                const count = categoryCounts.get(cat.id) || 0;
                const isSelected = selectedCategoryIds.has(cat.id);
                return (
                  <div key={cat.id} className="category-chip-row">
                    <button
                      className={`category-chip ${isSelected ? 'selected' : ''}`}
                      style={{ '--chip-color': cat.color || '#6366f1' } as React.CSSProperties}
                      onClick={() => toggleCategoryFilter(cat.id)}
                      title={cat.description || cat.name}
                    >
                      <span className="chip-dot" />
                      <span className="chip-name">{cat.name}</span>
                      {count > 0 && <span className="chip-count">{count}</span>}
                    </button>
                    <button
                      className="chip-edit-btn"
                      onClick={() => openEditCategory(cat)}
                      title="编辑分类"
                    >✎</button>
                  </div>
                );
              })}
              {categories.length === 0 && (
                <p className="empty-hint">暂无分类，点击 + 添加</p>
              )}
            </div>
          </div>
          {selectedCategoryIds.size > 0 && (
            <div className="sidebar-filter-footer">
              <span className="filter-active-label">已选 {selectedCategoryIds.size} 个</span>
              <button
                className="clear-filter-btn"
                onClick={() => setSelectedCategoryIds(new Set())}
              >清除</button>
            </div>
          )}
        </aside>

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
                <button className="clear-btn" onClick={() => setSearchKeyword('')}>×</button>
              )}
            </div>
            <button className="add-btn" onClick={() => setShowAddStock(true)}>
              + 添加股票
            </button>
          </div>

          {/* Stock list */}
          <div className="stock-list">
            {stocks.length === 0 ? (
              <div className="empty-state">
                <p>暂无股票数据</p>
                <p className="empty-sub">点击"添加股票"开始</p>
              </div>
            ) : (
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>代码</th>
                    <th>名称</th>
                    <th>分类</th>
                    <th>备注</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStocks.map(stock => (
                    <tr key={stock.id} className="stock-row" onClick={() => openProfileEditor(stock)}>
                      <td className="stock-code">
                        <span className={`market-badge market-badge-${(stock.market || 'CN').toLowerCase()}`}>{stock.market || 'CN'}</span>
                        {stock.code}
                      </td>
                      <td className="stock-name">{stock.name}</td>
                      <td>
                        <div className="stock-categories">
                          {stock.categories?.map(cat => (
                            <span
                              key={cat.id}
                              className="mini-chip"
                              style={{ '--cat-color': cat.color || '#6366f1' } as React.CSSProperties}
                            >
                              <span className="mini-chip-dot" />
                              {cat.name}
                            </span>
                          ))}
                          {(!stock.categories || stock.categories.length === 0) && (
                            <span className="no-cat">未分类</span>
                          )}
                        </div>
                      </td>
                      <td className="stock-notes">{stock.notes || '-'}</td>
                      <td className="stock-actions" onClick={e => e.stopPropagation()}>
                        <button
                          className="action-btn"
                          title="设置分类"
                          onClick={() => {
                            setAssignStock(stock);
                            setAssignedIds(new Set(stock.categories?.map(c => c.id) || []));
                            setAssignSearch('');
                          }}
                        >🏷️</button>
                        <button
                          className="action-btn timeline"
                          title="查看时间线"
                          onClick={() => openTimeline(stock)}
                        >⏱️</button>
                        <button
                          className="action-btn document"
                          title="文档记录"
                          onClick={() => openDocumentCenter(stock)}
                        >📄</button>
                        <button
                          className="action-btn danger"
                          title="删除"
                          onClick={() => setPendingDeleteStock(stock)}
                        >🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="stock-count">
            共 {displayedStocks.length} 只
            {marketFilter !== 'all' && <span className="stock-count-market">（{marketFilter === 'CN' ? 'A股' : '美股'}）</span>}
          </div>
        </section>
      </main>

      {/* Add Stock Modal */}
      {showAddStock && (
        <div className="modal-overlay" onClick={() => {
          setShowAddStock(false);
          setNewStockCode('');
          setNewStockName('');
          setNewStockNotes('');
          setNewStockMarket('CN');
          setCodeSuggestions([]);
          setNameSuggestions([]);
          setActiveSuggestField(null);
        }}>
          <div className="glass-modal" onClick={e => e.stopPropagation()}>
            <h2>添加股票</h2>
            <div className="form-group">
              <label>市场</label>
              <div className="market-select-group">
                <button
                  className={`market-select-btn ${newStockMarket === 'CN' ? 'active' : ''}`}
                  onClick={() => { setNewStockMarket('CN'); setNewStockCode(''); setNewStockName(''); setCodeSuggestions([]); setNameSuggestions([]); }}
                >🇨🇳 A股</button>
                <button
                  className={`market-select-btn ${newStockMarket === 'US' ? 'active' : ''}`}
                  onClick={() => { setNewStockMarket('US'); setNewStockCode(''); setNewStockName(''); setCodeSuggestions([]); setNameSuggestions([]); }}
                >🇺🇸 美股</button>
              </div>
            </div>
            <div className="form-group">
              <label>{newStockMarket === 'US' ? 'Ticker' : '股票代码'}</label>
              <div className="input-stack">
                <div className="input-with-btn">
                  <input
                    type="text"
                    placeholder={newStockMarket === 'US' ? '如 AAPL、NVDA、TSLA' : '如 600519'}
                    value={newStockCode}
                    onFocus={() => setActiveSuggestField('code')}
                    onBlur={() => setTimeout(() => setActiveSuggestField(prev => (prev === 'code' ? null : prev)), 120)}
                    onChange={e => setNewStockCode(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && codeSuggestions.length > 0) {
                        e.preventDefault();
                        handleChooseSuggestion(codeSuggestions[0]);
                      }
                    }}
                  />
                  <button
                    className="lookup-btn"
                    onClick={() => handleLookup(newStockCode, 'code')}
                    disabled={lookingUp}
                  >{lookingUp ? '...' : '查询'}</button>
                </div>
                {activeSuggestField === 'code' && codeSuggestions.length > 0 && (
                  <div className="suggestion-list">
                    {codeSuggestions.map(item => (
                      <button
                        key={`${item.code}-${item.name}`}
                        className="suggestion-item"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleChooseSuggestion(item)}
                      >
                        <span className="suggestion-code">{item.code}</span>
                        <span className="suggestion-name">{item.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="form-group">
              <label>公司名称</label>
              <div className="input-stack">
                <div className="input-with-btn">
                  <input
                    type="text"
                    placeholder={newStockMarket === 'US' ? '如 Apple Inc.' : '如 贵州茅台'}
                    value={newStockName}
                    onFocus={() => setActiveSuggestField('name')}
                    onBlur={() => setTimeout(() => setActiveSuggestField(prev => (prev === 'name' ? null : prev)), 120)}
                    onChange={e => setNewStockName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && nameSuggestions.length > 0) {
                        e.preventDefault();
                        handleChooseSuggestion(nameSuggestions[0]);
                      }
                    }}
                  />
                  <button
                    className="lookup-btn"
                    onClick={() => handleLookup(newStockName, 'name')}
                    disabled={lookingUp}
                  >{lookingUp ? '...' : '查询'}</button>
                </div>
                {activeSuggestField === 'name' && nameSuggestions.length > 0 && (
                  <div className="suggestion-list">
                    {nameSuggestions.map(item => (
                      <button
                        key={`${item.code}-${item.name}`}
                        className="suggestion-item"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleChooseSuggestion(item)}
                      >
                        <span className="suggestion-code">{item.code}</span>
                        <span className="suggestion-name">{item.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="form-group">
              <label>备注</label>
              <textarea
                placeholder="公司基本情况..."
                value={newStockNotes}
                onChange={e => setNewStockNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => {
                setShowAddStock(false);
                setNewStockCode('');
                setNewStockName('');
                setNewStockNotes('');
                setNewStockMarket('CN');
                setCodeSuggestions([]);
                setNameSuggestions([]);
                setActiveSuggestField(null);
              }}>取消</button>
              <button className="confirm-btn" onClick={handleAddStock}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategory && (
        <div className="modal-overlay" onClick={() => { setShowAddCategory(false); setNewCategoryName(''); setNewCategoryDesc(''); }}>
          <div className="glass-modal cat-form-modal" onClick={e => e.stopPropagation()}>
            <h2>新建分类</h2>
            <div className="form-group">
              <label>分类名称</label>
              <input
                type="text"
                placeholder="如 白酒、新能源、AI算力..."
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>说明 <span className="form-optional">（可选）</span></label>
              <input
                type="text"
                placeholder="简要描述这个分类涵盖的范围..."
                value={newCategoryDesc}
                onChange={e => setNewCategoryDesc(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>颜色</label>
              <div className="color-swatch-grid">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    className={`color-swatch ${newCategoryColor === color ? 'active' : ''}`}
                    style={{ '--swatch-color': color } as React.CSSProperties}
                    onClick={() => setNewCategoryColor(color)}
                  />
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => { setShowAddCategory(false); setNewCategoryName(''); setNewCategoryDesc(''); }}>取消</button>
              <button className="confirm-btn" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Categories Modal */}
      {assignStock && (
        <div className="modal-overlay" onClick={() => { setAssignStock(null); setAssignSearch(''); }}>
          <div className="glass-modal assign-modal" onClick={e => e.stopPropagation()}>
            <div className="assign-modal-header">
              <h2>设置分类</h2>
              <span className="assign-modal-stock">{assignStock.code}&nbsp;{assignStock.name}</span>
            </div>
            {categories.length > 5 && (
              <div className="assign-search-box">
                <input
                  className="assign-search-input"
                  type="text"
                  placeholder="搜索分类..."
                  value={assignSearch}
                  onChange={e => setAssignSearch(e.target.value)}
                />
              </div>
            )}
            <div className="assign-tag-cloud">
              {categories
                .filter(cat =>
                  !assignSearch ||
                  cat.name.toLowerCase().includes(assignSearch.toLowerCase()) ||
                  (cat.description || '').toLowerCase().includes(assignSearch.toLowerCase())
                )
                .map(cat => {
                  const selected = assignedIds.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      className={`assign-tag ${selected ? 'selected' : ''}`}
                      style={{ '--cat-color': cat.color || '#6366f1' } as React.CSSProperties}
                      title={cat.description || ''}
                      onClick={() => {
                        setAssignedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(cat.id)) next.delete(cat.id);
                          else next.add(cat.id);
                          return next;
                        });
                      }}
                    >
                      <span className="assign-tag-dot" />
                      <span>{cat.name}</span>
                      {selected && <span className="assign-tag-check">✓</span>}
                    </button>
                  );
                })}
              {categories.length === 0 && <p className="empty-hint">请先在左侧栏添加分类</p>}
            </div>
            {assignedIds.size > 0 && (
              <div className="assign-selected-summary">已选 {assignedIds.size} 个分类</div>
            )}
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => { setAssignStock(null); setAssignSearch(''); }}>取消</button>
              <button className="confirm-btn" onClick={handleSaveAssign}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {pendingDeleteStock && (
        <div className="modal-overlay" onClick={() => !deletingStock && setPendingDeleteStock(null)}>
          <div className="glass-modal delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <h2>确认删除</h2>
            <div className="delete-confirm-body">
              <p className="delete-confirm-text">你将删除以下股票：</p>
              <p className="delete-confirm-target">{pendingDeleteStock.code} {pendingDeleteStock.name}</p>
              <p className="delete-confirm-sub">此操作不可撤销，相关分类关联和后续编辑入口将被移除。</p>
            </div>
            <div className="modal-actions">
              <button
                className="cancel-btn"
                onClick={() => setPendingDeleteStock(null)}
                disabled={deletingStock}
              >取消</button>
              <button
                className="confirm-btn"
                onClick={handleDeleteStock}
                disabled={deletingStock}
              >{deletingStock ? '删除中...' : '确认删除'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
        <div className="modal-overlay" onClick={() => setEditingCategory(null)}>
          <div className="glass-modal cat-form-modal" onClick={e => e.stopPropagation()}>
            <h2>编辑分类</h2>
            <div className="form-group">
              <label>分类名称</label>
              <input
                type="text"
                value={editCategoryName}
                onChange={e => setEditCategoryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveEditCategory()}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>说明 <span className="form-optional">（可选）</span></label>
              <input
                type="text"
                placeholder="简要描述这个分类涵盖的范围..."
                value={editCategoryDesc}
                onChange={e => setEditCategoryDesc(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>颜色</label>
              <div className="color-swatch-grid">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    className={`color-swatch ${editCategoryColor === color ? 'active' : ''}`}
                    style={{ '--swatch-color': color } as React.CSSProperties}
                    onClick={() => setEditCategoryColor(color)}
                  />
                ))}
              </div>
            </div>
            <div className="cat-form-footer">
              <button
                className="cat-delete-btn"
                onClick={() => setPendingDeleteCategory(editingCategory)}
              >删除分类</button>
              <div className="modal-actions" style={{ padding: 0 }}>
                <button className="cancel-btn" onClick={() => setEditingCategory(null)}>取消</button>
                <button className="confirm-btn" onClick={handleSaveEditCategory} disabled={!editCategoryName.trim()}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Category Confirm */}
      {pendingDeleteCategory && (
        <div className="modal-overlay" onClick={() => setPendingDeleteCategory(null)}>
          <div className="glass-modal delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <h2>确认删除分类</h2>
            <div className="delete-confirm-body">
              <p className="delete-confirm-text">即将删除分类：</p>
              <p className="delete-confirm-target">{pendingDeleteCategory.name}</p>
              <p className="delete-confirm-sub">已关联此分类的股票不会被删除，只是移除关联。</p>
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setPendingDeleteCategory(null)}>取消</button>
              <button className="confirm-btn danger" onClick={handleDeleteCategoryConfirmed}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {/* Company Profile Modal */}
      {profileStock && (
        <div className="modal-overlay" onClick={() => { setProfileStock(null); setShowJsonImport(false); }}>
          <div className="glass-modal profile-modal" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="profile-header">
              <div className="profile-header-left">
                <span className="profile-header-code">{profileStock.code}</span>
                <span className="profile-header-name">{profileStock.name}</span>
                <span className="profile-header-tag">公司档案</span>
              </div>
              <div className="profile-header-right">
                {profileMode === 'read' ? (
                  <button className="profile-header-btn" onClick={() => setProfileMode('edit')}>编辑</button>
                ) : (
                  <>
                    <button
                      className="profile-header-btn secondary"
                      onClick={() => { setShowJsonImport(true); setJsonImportError(''); }}
                    >JSON 导入</button>
                    <button
                      className="profile-header-btn"
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                    >{savingProfile ? '保存中...' : '保存'}</button>
                    <button className="profile-header-btn ghost" onClick={handleCancelEdit}>取消</button>
                  </>
                )}
                <button
                  className="profile-header-close"
                  onClick={() => { setProfileStock(null); setShowJsonImport(false); }}
                >×</button>
              </div>
            </div>

            {/* Two-panel body */}
            <div className="profile-body">

              {/* Section nav */}
              <nav className="profile-nav">
                {profileSections.map(section => {
                  const filled = !!section.value?.trim();
                  return (
                    <button
                      key={section.key}
                      className={`profile-nav-item ${profileActiveSection === section.key ? 'active' : ''}`}
                      onClick={() => setProfileActiveSection(section.key)}
                    >
                      <span className={`profile-nav-dot ${filled ? 'filled' : ''}`} />
                      <span className="profile-nav-label">{section.title}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Content area */}
              <div className="profile-content">
                {profileSections.map(section => {
                  if (section.key !== profileActiveSection) return null;
                  return (
                    <div key={section.key} className="profile-section-view">
                      <div className="profile-section-heading">
                        <h3>{section.title}</h3>
                        {profileMode === 'read' && (
                          <button
                            className="profile-section-edit-btn"
                            onClick={() => setProfileMode('edit')}
                          >编辑</button>
                        )}
                      </div>

                      {profileMode === 'read' ? (
                        <div className="profile-section-read">
                          {section.value?.trim() ? (
                            <div className="doc-markdown-body">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.value}</ReactMarkdown>
                            </div>
                          ) : (
                            <div className="profile-section-empty">
                              <span className="profile-empty-icon">○</span>
                              <span>暂无内容，点击「编辑」填写</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <AutoResizeTextarea
                          className="profile-edit-textarea"
                          value={profileDraft[section.key as keyof typeof profileDraft]}
                          onChange={e => setProfileDraft(prev => ({ ...prev, [section.key]: e.target.value }))}
                          placeholder={section.placeholder}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* JSON Import overlay */}
          {showJsonImport && profileMode === 'edit' && (
            <div className="modal-overlay json-import-modal-overlay" onClick={() => setShowJsonImport(false)}>
              <div className="glass-modal json-import-modal" onClick={e => e.stopPropagation()}>
                <h2>JSON 导入</h2>
                <div className="json-import-panel">
                  <label className="json-import-label">粘贴 JSON 后导入</label>
                  <textarea
                    className="json-import-textarea"
                    value={jsonImportText}
                    onChange={e => setJsonImportText(e.target.value)}
                    placeholder='例如: {"business":"...","customers":"...","competitors":"...","strengths":"...","structuralWeaknesses":"...","future":"...","founderCeoHolding":"...","notes":"..."}'
                  />
                  {jsonImportError && <p className="json-import-error">{jsonImportError}</p>}
                  <div className="json-import-actions">
                    <button className="cancel-btn" onClick={() => setShowJsonImport(false)}>取消</button>
                    <button className="confirm-btn" onClick={applyJsonToProfileDraft}>导入并覆盖对应字段</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Document Modal */}
      {documentStock && (
        <div className="modal-overlay" onClick={() => !savingDocument && setDocumentStock(null)}>
          <div className="glass-modal document-modal" onClick={e => e.stopPropagation()}>

            {/* ---- List View ---- */}
            {docViewMode === 'list' && (
              <>
                <div className="doc-modal-header">
                  <div className="doc-modal-title-row">
                    <h2>{documentStock.code} {documentStock.name}</h2>
                    <span className="doc-modal-subtitle">研究日志</span>
                  </div>
                  <button
                    className="doc-new-btn"
                    onClick={() => { setEditDocTitle(''); setEditDocContent(''); setDocViewMode('compose'); }}
                    disabled={savingDocument}
                  >+ 新建日志</button>
                </div>

                <div className="doc-list-scroll">
                  {documentsLoading ? (
                    <div className="timeline-empty">加载中...</div>
                  ) : documents.length === 0 ? (
                    <div className="doc-empty-state">
                      <div className="doc-empty-icon">📓</div>
                      <p>还没有日志</p>
                      <p className="doc-empty-sub">点击「新建日志」开始记录研究心得</p>
                    </div>
                  ) : (
                    <div className="doc-list">
                      {documents.map(doc => {
                        const preview = doc.content.replace(/[#*`>\-_~\[\]()]/g, '').trim().slice(0, 120);
                        const wordCount = doc.content.length;
                        const dt = new Date(doc.createdAt);
                        const timeStr = dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
                        return (
                          <article
                            key={doc.id}
                            className="doc-card"
                            onClick={() => { setSelectedDocument(doc); setDocViewMode('read'); }}
                          >
                            <div className="doc-card-date">
                              <span className="doc-card-day">{dt.getDate()}</span>
                              <span className="doc-card-month">{dt.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' })}</span>
                            </div>
                            <div className="doc-card-body">
                              <h3 className="doc-card-title">{doc.title}</h3>
                              <p className="doc-card-preview">{preview}{doc.content.length > 120 ? '…' : ''}</p>
                              <div className="doc-card-meta">
                                <span>{timeStr}</span>
                                <span>{wordCount} 字</span>
                                {doc.updatedAt !== doc.createdAt && <span>已编辑</span>}
                              </div>
                            </div>
                            <span className="doc-card-arrow">›</span>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="modal-actions sticky-actions">
                  <button className="cancel-btn" onClick={() => setDocumentStock(null)}>关闭</button>
                </div>
              </>
            )}

            {/* ---- Read View ---- */}
            {docViewMode === 'read' && selectedDocument && (
              <>
                <div className="doc-modal-header">
                  <button className="doc-back-btn" onClick={() => setDocViewMode('list')}>‹ 返回列表</button>
                  <div className="doc-read-actions">
                    <button className="doc-action-edit" onClick={() => {
                      setEditDocTitle(selectedDocument.title);
                      setEditDocContent(selectedDocument.content);
                      setDocViewMode('edit');
                    }}>编辑</button>
                    <button className="doc-action-delete" onClick={() => setPendingDeleteDoc(selectedDocument)}>删除</button>
                  </div>
                </div>

                <div className="doc-read-scroll">
                  <div className="doc-read-meta">
                    <time>{new Date(selectedDocument.createdAt).toLocaleString('zh-CN', { hour12: false })}</time>
                    {selectedDocument.updatedAt !== selectedDocument.createdAt && (
                      <span className="doc-read-edited">已编辑 · {new Date(selectedDocument.updatedAt).toLocaleString('zh-CN', { hour12: false })}</span>
                    )}
                  </div>
                  <h1 className="doc-read-title">{selectedDocument.title}</h1>
                  <div className="doc-markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedDocument.content}</ReactMarkdown>
                  </div>
                </div>

                <div className="modal-actions sticky-actions">
                  <button className="cancel-btn" onClick={() => setDocViewMode('list')}>返回列表</button>
                </div>

                {/* Delete confirm inline */}
                {pendingDeleteDoc && (
                  <div className="modal-overlay" onClick={() => !savingDocument && setPendingDeleteDoc(null)}>
                    <div className="glass-modal delete-confirm-modal" onClick={e => e.stopPropagation()}>
                      <h2>确认删除日志</h2>
                      <div className="delete-confirm-body">
                        <p className="delete-confirm-text">将要删除：</p>
                        <p className="delete-confirm-target">《{pendingDeleteDoc.title}》</p>
                        <p className="delete-confirm-sub">此操作不可撤销。</p>
                      </div>
                      <div className="modal-actions">
                        <button className="cancel-btn" onClick={() => setPendingDeleteDoc(null)} disabled={savingDocument}>取消</button>
                        <button className="confirm-btn danger" onClick={handleDeleteDocument} disabled={savingDocument}>
                          {savingDocument ? '删除中...' : '确认删除'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ---- Compose / Edit View ---- */}
            {(docViewMode === 'compose' || docViewMode === 'edit') && (
              <>
                <div className="doc-modal-header">
                  <button className="doc-back-btn" onClick={() => {
                    if (docViewMode === 'edit') { setDocViewMode('read'); }
                    else { setDocViewMode('list'); }
                  }}>‹ {docViewMode === 'edit' ? '返回阅读' : '返回列表'}</button>
                  <h2 className="doc-compose-heading">{docViewMode === 'edit' ? '编辑日志' : '新建日志'}</h2>
                </div>

                <div className="doc-compose-body">
                  <input
                    className="doc-compose-title-input"
                    type="text"
                    placeholder="日志标题，例如：2026Q1 业绩复盘"
                    value={editDocTitle}
                    onChange={e => setEditDocTitle(e.target.value)}
                    autoFocus
                  />
                  <div className="doc-compose-hint">支持 Markdown 语法 · 阅读时渲染</div>
                  <textarea
                    className="doc-compose-textarea"
                    placeholder="开始记录…&#10;&#10;支持 Markdown：&#10;## 标题  **粗体**  *斜体*  `代码`&#10;- 列表  > 引用  ---分割线"
                    value={editDocContent}
                    onChange={e => setEditDocContent(e.target.value)}
                  />
                </div>

                <div className="modal-actions sticky-actions">
                  <button className="cancel-btn" onClick={() => {
                    if (docViewMode === 'edit') setDocViewMode('read');
                    else setDocViewMode('list');
                  }} disabled={savingDocument}>取消</button>
                  <button
                    className="confirm-btn"
                    onClick={docViewMode === 'edit' ? handleUpdateDocument : handleAddDocument}
                    disabled={savingDocument || !editDocTitle.trim() || !editDocContent.trim()}
                  >{savingDocument ? '保存中...' : '保存日志'}</button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* Timeline Modal */}
      {timelineStock && (
        <div className="modal-overlay" onClick={() => setTimelineStock(null)}>
          <div className="glass-modal timeline-modal" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="timeline-modal-header">
              <div className="timeline-modal-title">
                <span className="timeline-modal-code">{timelineStock.code}</span>
                <span className="timeline-modal-name">{timelineStock.name}</span>
                <span className="timeline-modal-badge">更新时间线</span>
              </div>
              <button className="profile-header-close" onClick={() => setTimelineStock(null)}>×</button>
            </div>

            {/* Body */}
            {timelineLoading ? (
              <div className="timeline-empty">时间线加载中...</div>
            ) : timelineEntries.length === 0 ? (
              <div className="timeline-empty">暂时还没有记录</div>
            ) : (
              <div className="timeline-body">
                {/* Horizontal scrollable track */}
                <div
                  className="timeline-h-wrapper"
                  ref={timelineTrackRef}
                  onMouseDown={e => {
                    const el = timelineTrackRef.current;
                    if (!el) return;
                    tlDrag.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft };
                  }}
                  onMouseMove={e => {
                    if (!tlDrag.current.active) return;
                    const el = timelineTrackRef.current;
                    if (!el) return;
                    e.preventDefault();
                    el.scrollLeft = tlDrag.current.scrollLeft - (e.clientX - tlDrag.current.startX);
                  }}
                  onMouseUp={() => { tlDrag.current.active = false; }}
                  onMouseLeave={() => { tlDrag.current.active = false; }}
                >
                  <div className="timeline-h-track">
                    <div className="timeline-h-line" />
                    {groupedTimelineDays.map(({ key, entries }) => {
                      const parts = key.split('-');
                      const isActive = selectedTimelineDayKey === key;
                      return (
                        <div
                          key={key}
                          className={`timeline-h-node${isActive ? ' active' : ''}`}
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedTimelineDayKey(isActive ? null : key);
                          }}
                        >
                          <div className="timeline-h-dot" />
                          <div className="timeline-h-date">
                            <span className="timeline-h-month">{parts[1]}/{parts[2]}</span>
                            <span className="timeline-h-year">{parts[0]}</span>
                            <span className="timeline-h-count">{entries.length} 项</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detail panel for selected day */}
                {selectedDayData ? (
                  <div className="timeline-day-panel">
                    <div className="timeline-day-panel-header">
                      <span className="timeline-day-panel-date">
                        {selectedDayData.key.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日')}
                      </span>
                      <span className="timeline-day-panel-count">{selectedDayData.entries.length} 项变动</span>
                    </div>
                    <div className="timeline-day-entries">
                      {selectedDayData.entries.map(item => (
                        <div key={item.id} className="timeline-day-entry">
                          <span className={`timeline-tag ${item.actionType.toLowerCase()}`}>
                            {actionTypeLabelMap[item.actionType] || item.actionType}
                          </span>
                          <time className="timeline-day-entry-time">
                            {new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </time>
                          <p className="timeline-day-entry-desc">{item.description || '更新了公司信息'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="timeline-day-hint">
                    点击上方日期节点查看当天的详细变动
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions sticky-actions">
              <button className="cancel-btn" onClick={() => setTimelineStock(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
