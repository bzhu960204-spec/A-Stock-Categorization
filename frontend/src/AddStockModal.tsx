import { useState, useEffect } from 'react';
import { NewStockCategoryPickerModal } from './CategoryPickerModals';
import { useEscapeKey } from './useEscapeKey';
import {
  createStock, setStockCategories,
  lookupStock, lookupStockSuggest, lookupUsStock, lookupUsStockSuggest,
  lookupGlobalStock, lookupGlobalStockSuggest,
  type Category, type LookupSuggestion,
} from './api';

type Market = 'CN' | 'US' | 'JP' | 'KR' | 'TW' | 'HK' | 'OTHER';

const GLOBAL_MARKETS = new Set<Market>(['JP', 'KR', 'TW', 'HK']);

const CODE_PLACEHOLDER: Record<Market, string> = {
  CN: '如 600519', US: '如 AAPL、NVDA、TSLA', JP: '如 7203 (Toyota)',
  KR: '如 005930 (Samsung)', TW: '如 2330 (台積電)', HK: '如 0700 (腾讯)',
  OTHER: '输入股票代码',
};

const NAME_PLACEHOLDER: Record<Market, string> = {
  CN: '如 贵州茅台', US: '如 Apple Inc.', JP: '如 トヨタ自動車',
  KR: '如 삼성전자', TW: '如 台灣積體電路', HK: '如 腾讯控股',
  OTHER: '输入公司名称',
};

function lookupByMarket(value: string, market: Market) {
  if (market === 'US') return lookupUsStock(value);
  if (GLOBAL_MARKETS.has(market)) return lookupGlobalStock(value, market);
  return lookupStock(value);
}

function suggestByMarket(query: string, market: Market, limit: number) {
  if (market === 'US') return lookupUsStockSuggest(query, limit);
  if (GLOBAL_MARKETS.has(market)) return lookupGlobalStockSuggest(query, market, limit);
  return lookupStockSuggest(query, limit);
}

function useLookupSuggestions(query: string, open: boolean, market: Market, minLen: number): LookupSuggestion[] {
  const [suggestions, setSuggestions] = useState<LookupSuggestion[]>([]);
  useEffect(() => {
    if (!open || market === 'OTHER') { setSuggestions([]); return; }
    const trimmed = query.trim();
    if (trimmed.length < minLen) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await suggestByMarket(trimmed, market, 8);
        setSuggestions(res.data);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open, market, minLen]);
  return suggestions;
}

interface AddStockModalProps {
  open: boolean;
  categories: Category[];
  initialCategoryIds: Set<number>;
  onClose: () => void;
  onCreated: () => void;
}

export function AddStockModal({ open, categories, initialCategoryIds, onClose, onCreated }: Readonly<AddStockModalProps>) {
  const [newStockMarket, setNewStockMarket] = useState<Market>('CN');
  const [newStockCustomMarket, setNewStockCustomMarket] = useState('');
  const [newStockCode, setNewStockCode] = useState('');
  const [newStockName, setNewStockName] = useState('');
  const [newStockNotes, setNewStockNotes] = useState('');
  const [newStockCategoryIds, setNewStockCategoryIds] = useState<Set<number>>(new Set());
  const [showNewStockCatPicker, setShowNewStockCatPicker] = useState(false);
  const [newStockCatSearch, setNewStockCatSearch] = useState('');
  const [addStockError, setAddStockError] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [activeSuggestField, setActiveSuggestField] = useState<'code' | 'name' | null>(null);

  // Initialize / reset fields whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setNewStockMarket('CN');
    setNewStockCustomMarket('');
    setNewStockCode('');
    setNewStockName('');
    setNewStockNotes('');
    setNewStockCategoryIds(new Set(initialCategoryIds));
    setNewStockCatSearch('');
    setAddStockError('');
    setActiveSuggestField(null);
  }, [open, initialCategoryIds]);

  const handleLookup = async (value: string, field: 'code' | 'name') => {
    if (!value.trim() || newStockMarket === 'OTHER') return;
    setLookingUp(true);
    try {
      const res = await lookupByMarket(value, newStockMarket);
      if (!res.data.error) {
        if (field === 'code') setNewStockName(res.data.name);
        else setNewStockCode(res.data.code);
      }
    } catch { /* ignore */ }
    setLookingUp(false);
  };

  const codeSuggestions = useLookupSuggestions(newStockCode, open, newStockMarket, 2);
  const nameSuggestions = useLookupSuggestions(newStockName, open, newStockMarket, 1);

  useEscapeKey(onClose, open);

  const handleChooseSuggestion = (item: LookupSuggestion) => {
    setNewStockCode(item.code);
    setNewStockName(item.name);
    setActiveSuggestField(null);
  };

  const handleAddStock = async () => {
    if (!newStockCode.trim()) { setAddStockError('请输入股票代码'); return; }
    if (!newStockName.trim()) { setAddStockError('请输入公司名称'); return; }
    if (newStockMarket === 'OTHER' && !newStockCustomMarket.trim()) { setAddStockError('请输入市场代码'); return; }
    setAddStockError('');
    try {
      const marketValue = newStockMarket === 'OTHER' ? newStockCustomMarket.trim().toUpperCase() : newStockMarket;
      const created = await createStock({ code: newStockCode, name: newStockName, notes: newStockNotes, market: marketValue });
      if (newStockCategoryIds.size > 0) {
        await setStockCategories(created.data.id, Array.from(newStockCategoryIds));
      }
      onCreated();
      onClose();
    } catch (e) {
      console.error('Failed to add stock', e);
    }
  };

  const markets: { key: Market; label: string }[] = [
    { key: 'CN', label: '🇨🇳 A股' },
    { key: 'US', label: '🇺🇸 美股' },
    { key: 'JP', label: '🇯🇵 日股' },
    { key: 'KR', label: '🇰🇷 韩股' },
    { key: 'TW', label: '🇹🇼 台股' },
    { key: 'HK', label: '🇭🇰 港股' },
    { key: 'OTHER', label: '🌐 其它市场' },
  ];

  if (!open) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="glass-modal" onClick={e => e.stopPropagation()}>
          <h2>添加股票</h2>
          <div className="form-group">
            <label>市场</label>
            <div className="market-select-group">
              {markets.map(m => (
                <button
                  key={m.key}
                  className={`market-select-btn ${newStockMarket === m.key ? 'active' : ''}`}
                  onClick={() => {
                    setNewStockMarket(m.key);
                    setNewStockCode('');
                    setNewStockName('');
                    if (m.key === 'OTHER') setNewStockCustomMarket('');
                  }}
                >{m.label}</button>
              ))}
            </div>
          </div>
          {newStockMarket === 'OTHER' && (
            <div className="form-group">
              <label>市场代码（自填）</label>
              <input
                type="text"
                placeholder="如 SGX、LSE、NASDAQ...(大写)"
                value={newStockCustomMarket}
                onChange={e => setNewStockCustomMarket(e.target.value.toUpperCase())}
                maxLength={10}
              />
            </div>
          )}
          <div className="form-group">
            <label>股票代码</label>
            <div className="input-stack">
              <div className="input-with-btn">
                <input
                  type="text"
                  placeholder={CODE_PLACEHOLDER[newStockMarket]}
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
                {newStockMarket !== 'OTHER' && (
                  <button
                    className="lookup-btn"
                    onClick={() => handleLookup(newStockCode, 'code')}
                    disabled={lookingUp}
                  >{lookingUp ? '...' : '查询'}</button>
                )}
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
                      {item.exchange && <span className="suggestion-exchange">{item.exchange}</span>}
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
                  placeholder={NAME_PLACEHOLDER[newStockMarket]}
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
                {newStockMarket !== 'OTHER' && (
                  <button
                    className="lookup-btn"
                    onClick={() => handleLookup(newStockName, 'name')}
                    disabled={lookingUp}
                  >{lookingUp ? '...' : '查询'}</button>
                )}
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
                      {item.exchange && <span className="suggestion-exchange">{item.exchange}</span>}
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
          {categories.length > 0 && (
            <div className="form-group">
              <label>分类</label>
              <button
                type="button"
                className="new-stock-cat-trigger"
                onClick={() => { setShowNewStockCatPicker(true); setNewStockCatSearch(''); }}
              >
                {newStockCategoryIds.size === 0
                  ? '点击选择分类…'
                  : (
                    <span className="new-stock-cat-preview">
                      {Array.from(newStockCategoryIds).map(id => {
                        const cat = categories.find(c => c.id === id);
                        return cat ? (
                          <span key={id} className="new-stock-cat-badge" style={{ background: cat.color || 'var(--accent)', color: '#fff' }}>{cat.name}</span>
                        ) : null;
                      })}
                      <span className="new-stock-cat-edit">编辑</span>
                    </span>
                  )
                }
              </button>
            </div>
          )}
          <div className="modal-actions">
            <button className="cancel-btn" onClick={onClose}>取消</button>
            {addStockError && <span style={{ color: 'var(--danger, #e74c3c)', fontSize: 13 }}>{addStockError}</span>}
            <button className="confirm-btn" onClick={handleAddStock}>添加</button>
          </div>
        </div>
      </div>

      <NewStockCategoryPickerModal
        open={showNewStockCatPicker}
        categories={categories}
        selectedIds={newStockCategoryIds}
        setSelectedIds={setNewStockCategoryIds}
        search={newStockCatSearch}
        onSearchChange={setNewStockCatSearch}
        onClear={() => { setNewStockCategoryIds(new Set()); setShowNewStockCatPicker(false); }}
        onConfirm={() => setShowNewStockCatPicker(false)}
        onOverlayClose={() => setShowNewStockCatPicker(false)}
      />
    </>
  );
}
