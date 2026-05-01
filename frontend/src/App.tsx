import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getStocks, createStock, deleteStock, setStockCategories, updateStock,
  getCategories, createCategory, deleteCategory,
  filterStocks, searchStocks, lookupStock, lookupStockSuggest,
  type Stock, type Category, type LookupSuggestion
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

function App() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [darkMode, setDarkMode] = useState(false);

  // Filter state
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set());
  const [filterMode, setFilterMode] = useState<'union' | 'intersection'>('union');
  const [searchKeyword, setSearchKeyword] = useState('');

  // Add stock dialog
  const [showAddStock, setShowAddStock] = useState(false);
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

  const pickUnusedColor = () => {
    const usedColors = new Set(categories.map(c => c.color));
    const unused = PRESET_COLORS.filter(c => !usedColors.has(c));
    const pool = unused.length > 0 ? unused : PRESET_COLORS;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // Assign categories dialog
  const [assignStock, setAssignStock] = useState<Stock | null>(null);
  const [assignedIds, setAssignedIds] = useState<Set<number>>(new Set());

  // Detail stock
  const [profileStock, setProfileStock] = useState<Stock | null>(null);
  const [profileMode, setProfileMode] = useState<'read' | 'edit'>('read');
  const [readSectionFilter, setReadSectionFilter] = useState('all');
  const [savingProfile, setSavingProfile] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonImportText, setJsonImportText] = useState('');
  const [jsonImportError, setJsonImportError] = useState('');
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
      const res = await lookupStock(value);
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
        const res = await lookupStockSuggest(trimmedCode, 8);
        setCodeSuggestions(res.data);
      } catch {
        setCodeSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [newStockCode, showAddStock]);

  useEffect(() => {
    if (!showAddStock) return;

    const trimmedName = newStockName.trim();
    if (trimmedName.length < 1) {
      setNameSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await lookupStockSuggest(trimmedName, 8);
        setNameSuggestions(res.data);
      } catch {
        setNameSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [newStockName, showAddStock]);

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
    setReadSectionFilter('all');
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
    { key: 'business', title: '业务', value: profileDraft.business },
    { key: 'customers', title: '客户', value: profileDraft.customers },
    { key: 'competitors', title: '竞争对手', value: profileDraft.competitors },
    { key: 'strengths', title: '竞争优势', value: profileDraft.strengths },
    { key: 'structuralWeaknesses', title: '结构性弱点', value: profileDraft.structuralWeaknesses },
    { key: 'founderCeoHolding', title: '创始人CEO及持股', value: profileDraft.founderCeoHolding },
    { key: 'future', title: '面向未来', value: profileDraft.future },
    { key: 'notes', title: '补充备注', value: profileDraft.notes },
  ];

  const visibleProfileSections = readSectionFilter === 'all'
    ? profileSections
    : profileSections.filter(section => section.key === readSectionFilter);

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

  // Add stock
  const handleAddStock = async () => {
    if (!newStockCode || !newStockName) return;
    try {
      await createStock({ code: newStockCode, name: newStockName, notes: newStockNotes });
      setShowAddStock(false);
      setNewStockCode('');
      setNewStockName('');
      setNewStockNotes('');
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
      await createCategory({ name: newCategoryName, color: newCategoryColor });
      setShowAddCategory(false);
      setNewCategoryName('');
      setNewCategoryColor(pickUnusedColor());
      loadData();
    } catch (e) {
      console.error('Failed to add category', e);
    }
  };

  // Save assigned categories
  const handleSaveAssign = async () => {
    if (!assignStock) return;
    try {
      await setStockCategories(assignStock.id, Array.from(assignedIds));
      setAssignStock(null);
      loadData();
    } catch (e) {
      console.error('Failed to assign categories', e);
    }
  };

  // Delete stock
  const handleDeleteStock = async (id: number) => {
    try {
      await deleteStock(id);
      loadData();
    } catch (e) {
      console.error('Failed to delete stock', e);
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

  return (
    <div className="app-container">
      {/* Header */}
      <header className="glass-header">
        <div className="header-left">
          <h1 className="app-title">A股分类系统</h1>
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
          <div className="sidebar-section">
            <div className="section-header">
              <h3>分类筛选</h3>
              <button className="small-btn" onClick={() => { setShowAddCategory(true); setNewCategoryColor(pickUnusedColor()); }}>+</button>
            </div>
            <div className="filter-mode">
              <button
                className={`mode-btn ${filterMode === 'union' ? 'active' : ''}`}
                onClick={() => setFilterMode('union')}
              >并集</button>
              <button
                className={`mode-btn ${filterMode === 'intersection' ? 'active' : ''}`}
                onClick={() => setFilterMode('intersection')}
              >交集</button>
            </div>
            <div className="category-list">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  className={`category-chip ${selectedCategoryIds.has(cat.id) ? 'selected' : ''}`}
                  style={{
                    '--chip-color': cat.color || '#6366f1',
                  } as React.CSSProperties}
                  onClick={() => toggleCategoryFilter(cat.id)}
                >
                  <span className="chip-dot" />
                  {cat.name}
                  <span
                    className="chip-delete"
                    onClick={e => {
                      e.stopPropagation();
                      deleteCategory(cat.id).then(loadData);
                    }}
                  >×</span>
                </button>
              ))}
              {categories.length === 0 && (
                <p className="empty-hint">暂无分类，点击 + 添加</p>
              )}
            </div>
          </div>
          {selectedCategoryIds.size > 0 && (
            <button
              className="clear-filter-btn"
              onClick={() => setSelectedCategoryIds(new Set())}
            >清除筛选</button>
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
                  {stocks.map(stock => (
                    <tr key={stock.id} className="stock-row" onClick={() => openProfileEditor(stock)}>
                      <td className="stock-code">{stock.code}</td>
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
                          }}
                        >🏷️</button>
                        <button
                          className="action-btn danger"
                          title="删除"
                          onClick={() => handleDeleteStock(stock.id)}
                        >🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="stock-count">
            共 {stocks.length} 只股票
          </div>
        </section>
      </main>

      {/* Add Stock Modal */}
      {showAddStock && (
        <div className="modal-overlay" onClick={() => {
          setShowAddStock(false);
          setCodeSuggestions([]);
          setNameSuggestions([]);
          setActiveSuggestField(null);
        }}>
          <div className="glass-modal" onClick={e => e.stopPropagation()}>
            <h2>添加股票</h2>
            <div className="form-group">
              <label>股票代码</label>
              <div className="input-stack">
                <div className="input-with-btn">
                  <input
                    type="text"
                    placeholder="如 600519"
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
              <label>股票名称</label>
              <div className="input-stack">
                <div className="input-with-btn">
                  <input
                    type="text"
                    placeholder="如 贵州茅台"
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
              <button className="cancel-btn" onClick={() => setShowAddStock(false)}>取消</button>
              <button className="confirm-btn" onClick={handleAddStock}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategory && (
        <div className="modal-overlay" onClick={() => setShowAddCategory(false)}>
          <div className="glass-modal" onClick={e => e.stopPropagation()}>
            <h2>添加分类</h2>
            <div className="form-group">
              <label>分类名称</label>
              <input
                type="text"
                placeholder="如 白酒、新能源..."
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowAddCategory(false)}>取消</button>
              <button className="confirm-btn" onClick={handleAddCategory}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Categories Modal */}
      {assignStock && (
        <div className="modal-overlay" onClick={() => setAssignStock(null)}>
          <div className="glass-modal" onClick={e => e.stopPropagation()}>
            <h2>设置分类 - {assignStock.name}</h2>
            <div className="assign-tag-cloud">
              {categories.map(cat => {
                const selected = assignedIds.has(cat.id);
                return (
                  <button
                    key={cat.id}
                    className={`assign-tag ${selected ? 'selected' : ''}`}
                    style={{ '--cat-color': cat.color || '#6366f1' } as React.CSSProperties}
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
                    {cat.name}
                  </button>
                );
              })}
              {categories.length === 0 && <p className="empty-hint">请先添加分类</p>}
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setAssignStock(null)}>取消</button>
              <button className="confirm-btn" onClick={handleSaveAssign}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Company Profile Modal */}
      {profileStock && (
        <div className="modal-overlay" onClick={() => {
          setProfileStock(null);
          setShowJsonImport(false);
        }}>
          <div className="glass-modal profile-modal" onClick={e => e.stopPropagation()}>
            <h2>{profileStock.code} {profileStock.name} - 公司信息</h2>

            <div className="profile-mode-switch">
              <button
                className={`profile-mode-btn ${profileMode === 'read' ? 'active' : ''}`}
                onClick={() => {
                  setProfileMode('read');
                  setShowJsonImport(false);
                }}
              >阅读视图</button>
              <button
                className={`profile-mode-btn ${profileMode === 'edit' ? 'active' : ''}`}
                onClick={() => setProfileMode('edit')}
              >编辑视图</button>
              {profileMode === 'edit' && (
                <button
                  className="profile-mode-btn"
                  onClick={() => {
                    setShowJsonImport(true);
                    setJsonImportError('');
                  }}
                >JSON 导入</button>
              )}
            </div>

            {profileMode === 'read' ? (
              <>
                <div className="profile-read-filter">
                  <label htmlFor="profile-read-filter">阅读模块</label>
                  <select
                    id="profile-read-filter"
                    className="profile-read-filter-select"
                    value={readSectionFilter}
                    onChange={e => setReadSectionFilter(e.target.value)}
                  >
                    <option value="all">全部模块</option>
                    {profileSections.map(section => (
                      <option key={section.key} value={section.key}>{section.title}</option>
                    ))}
                  </select>
                </div>

                <div className="profile-read-scroll">
                  {visibleProfileSections.map(section => (
                    <section key={section.key} className="profile-read-section">
                      <h3>{section.title}</h3>
                      <div className="profile-read-content">
                        {section.value?.trim() ? section.value : '暂无内容'}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <div className="profile-scroll">
                <div className="form-group">
                  <label>业务</label>
                  <AutoResizeTextarea
                    value={profileDraft.business}
                    onChange={e => setProfileDraft(prev => ({ ...prev, business: e.target.value }))}
                    placeholder="记录公司主营业务、业务结构、业务变化..."
                  />
                </div>

                <div className="form-group">
                  <label>客户</label>
                  <AutoResizeTextarea
                    value={profileDraft.customers}
                    onChange={e => setProfileDraft(prev => ({ ...prev, customers: e.target.value }))}
                    placeholder="记录核心客户、集中度、议价能力..."
                  />
                </div>

                <div className="form-group">
                  <label>竞争对手</label>
                  <AutoResizeTextarea
                    value={profileDraft.competitors}
                    onChange={e => setProfileDraft(prev => ({ ...prev, competitors: e.target.value }))}
                    placeholder="记录主要竞争对手、市场格局..."
                  />
                </div>

                <div className="form-group">
                  <label>竞争优势</label>
                  <AutoResizeTextarea
                    value={profileDraft.strengths}
                    onChange={e => setProfileDraft(prev => ({ ...prev, strengths: e.target.value }))}
                    placeholder="记录护城河、成本优势、渠道能力、品牌与生态壁垒..."
                  />
                </div>

                <div className="form-group">
                  <label>结构性弱点</label>
                  <AutoResizeTextarea
                    value={profileDraft.structuralWeaknesses}
                    onChange={e => setProfileDraft(prev => ({ ...prev, structuralWeaknesses: e.target.value }))}
                    placeholder="记录商业模式或行业位置中的长期弱点、脆弱点..."
                  />
                </div>

                <div className="form-group">
                  <label>创始人CEO及持股</label>
                  <AutoResizeTextarea
                    value={profileDraft.founderCeoHolding}
                    onChange={e => setProfileDraft(prev => ({ ...prev, founderCeoHolding: e.target.value }))}
                    placeholder="记录创始人/CEO 控制权与持股结构..."
                  />
                </div>

                <div className="form-group">
                  <label>面向未来</label>
                  <AutoResizeTextarea
                    value={profileDraft.future}
                    onChange={e => setProfileDraft(prev => ({ ...prev, future: e.target.value }))}
                    placeholder="记录公司顺应未来变化在做什么，例如 AI、出海、技术路线、组织变革..."
                  />
                </div>

                <div className="form-group">
                  <label>补充备注</label>
                  <AutoResizeTextarea
                    value={profileDraft.notes}
                    onChange={e => setProfileDraft(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="其它补充信息..."
                  />
                </div>
              </div>
            )}

            <div className="modal-actions sticky-actions">
              <button
                className="cancel-btn"
                onClick={() => {
                  setProfileStock(null);
                  setShowJsonImport(false);
                }}
              >关闭</button>
              {profileMode === 'read' ? (
                <button className="confirm-btn" onClick={() => setProfileMode('edit')}>去编辑</button>
              ) : (
                <button className="confirm-btn" onClick={handleSaveProfile} disabled={savingProfile}>
                  {savingProfile ? '保存中' : '保存'}
                </button>
              )}
            </div>
          </div>

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
    </div>
  );
}

export default App;
