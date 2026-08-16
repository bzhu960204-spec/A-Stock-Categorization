import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { autoFenceBoxArt } from './markdownUtils';
import { buildChainsPrintHtml } from './printExport';
import { useEscapeKey } from './useEscapeKey';
import {
  getIndustryChains, createIndustryChain, updateIndustryChain, deleteIndustryChain,
  type Stock, type IndustryChain,
} from './api';

interface IndustryChainModalProps {
  stock: Stock;
  open: boolean;
  onClose: () => void;
}

export function IndustryChainModal({ stock, open, onClose }: IndustryChainModalProps) {
  const [industryChains, setIndustryChains] = useState<IndustryChain[]>([]);
  const [loadingChains, setLoadingChains] = useState(false);
  const [chainFormMode, setChainFormMode] = useState<'none' | 'add' | 'edit' | 'json-import'>('none');
  const [editingChain, setEditingChain] = useState<IndustryChain | null>(null);
  const [chainFormTitle, setChainFormTitle] = useState('');
  const [chainFormContent, setChainFormContent] = useState('');
  const [savingChain, setSavingChain] = useState(false);
  const [viewingChain, setViewingChain] = useState<IndustryChain | null>(null);
  const [pendingDeleteChain, setPendingDeleteChain] = useState<IndustryChain | null>(null);
  const [chainJsonText, setChainJsonText] = useState('');
  const [chainJsonError, setChainJsonError] = useState('');
  const [importingChains, setImportingChains] = useState(false);

  // Load chains each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setChainFormMode('none');
    setEditingChain(null);
    setViewingChain(null);
    setPendingDeleteChain(null);
    setChainJsonText('');
    setChainJsonError('');
    setLoadingChains(true);
    getIndustryChains(stock.id)
      .then(res => setIndustryChains(res.data))
      .finally(() => setLoadingChains(false));
  }, [open, stock.id]);

  const openAddChainForm = () => {
    setChainFormMode('add');
    setEditingChain(null);
    setChainFormTitle('');
    setChainFormContent('');
  };

  const openEditChainForm = (chain: IndustryChain) => {
    setChainFormMode('edit');
    setEditingChain(chain);
    setChainFormTitle(chain.title);
    setChainFormContent(chain.content);
  };

  const handleExportChainsPdf = () => {
    if (industryChains.length === 0) return;
    const printHtml = buildChainsPrintHtml(stock, industryChains);

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { alert('请允许弹出窗口以导出 PDF'); return; }
    w.document.write(printHtml);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 600);
  };

  const handleImportChainsJson = async () => {
    setChainJsonError('');
    let parsed: { title: string; content: string }[];
    try {
      const raw = JSON.parse(chainJsonText);
      if (!Array.isArray(raw)) throw new Error('顶层必须是 JSON 数组 [ ... ]');
      parsed = raw.map((item, i) => {
        if (typeof item?.title !== 'string' || !item.title.trim()) throw new Error(`第 ${i + 1} 项缺少 title 字段`);
        if (typeof item?.content !== 'string' || !item.content.trim()) throw new Error(`第 ${i + 1} 项缺少 content 字段`);
        return { title: item.title.trim(), content: item.content.trim() };
      });
    } catch (e: unknown) {
      setChainJsonError((e as Error).message || 'JSON 格式错误');
      return;
    }
    setImportingChains(true);
    try {
      const results: IndustryChain[] = [];
      for (const item of parsed) {
        const res = await createIndustryChain(stock.id, item);
        results.push(res.data);
      }
      setIndustryChains(prev => [...prev, ...results]);
      setChainFormMode('none');
      setChainJsonText('');
      setChainJsonError('');
    } catch {
      setChainJsonError('导入失败，请重试。');
    } finally {
      setImportingChains(false);
    }
  };

  const handleSaveChain = async () => {
    if (!chainFormTitle.trim() || !chainFormContent.trim()) return;
    setSavingChain(true);
    try {
      if (chainFormMode === 'add') {
        const res = await createIndustryChain(stock.id, { title: chainFormTitle.trim(), content: chainFormContent.trim() });
        setIndustryChains(prev => [...prev, res.data]);
        setViewingChain(res.data);
      } else if (chainFormMode === 'edit' && editingChain) {
        const res = await updateIndustryChain(stock.id, editingChain.id, { title: chainFormTitle.trim(), content: chainFormContent.trim() });
        setIndustryChains(prev => prev.map(c => c.id === res.data.id ? res.data : c));
        setViewingChain(res.data);  // return to read view with updated content
      }
      setChainFormMode('none');
      setEditingChain(null);
    } finally {
      setSavingChain(false);
    }
  };

  const handleDeleteChain = async (chain: IndustryChain) => {
    await deleteIndustryChain(stock.id, chain.id);
    setIndustryChains(prev => prev.filter(c => c.id !== chain.id));
    setPendingDeleteChain(null);
    if (viewingChain?.id === chain.id) setViewingChain(null);
  };

  // Overlay click / Escape steps back one level: form -> read -> list -> close.
  const handleBack = () => {
    if (chainFormMode !== 'none') { setChainFormMode('none'); setEditingChain(null); }
    else if (viewingChain) { setViewingChain(null); }
    else { onClose(); setPendingDeleteChain(null); }
  };

  useEscapeKey(handleBack, open);

  if (!open) return null;

  return (
    <div className="modal-overlay chain-modal-overlay" onClick={handleBack}>
      <div className="chain-modal" onClick={e => e.stopPropagation()}>
        <div className="chain-modal-header">
          <span className="chain-modal-title">
            {chainFormMode === 'add' ? '新建业务线'
              : chainFormMode === 'edit' ? '编辑业务线'
              : chainFormMode === 'json-import' ? 'JSON 批量导入'
              : viewingChain ? viewingChain.title
              : '产业链管理'}
          </span>
          <div className="chain-modal-header-actions">
            {chainFormMode === 'none' && !viewingChain && (
              <>
                {industryChains.length > 0 && (
                  <button className="chain-add-btn chain-export-btn" onClick={handleExportChainsPdf} title="导出 PDF">↓ 导出 PDF</button>
                )}
                <button className="chain-add-btn" onClick={() => { setChainFormMode('json-import'); setChainJsonText(''); setChainJsonError(''); }}>JSON 导入</button>
                <button className="chain-add-btn" onClick={openAddChainForm}>+ 添加业务线</button>
              </>
            )}
            {viewingChain && chainFormMode === 'none' && (
              <button className="chain-item-btn" onClick={() => openEditChainForm(viewingChain)}>编辑</button>
            )}
            {(chainFormMode === 'add' || chainFormMode === 'edit') && (
              <button
                className="confirm-btn"
                onClick={handleSaveChain}
                disabled={savingChain || !chainFormTitle.trim() || !chainFormContent.trim()}
              >{savingChain ? '保存中…' : '保存'}</button>
            )}
            {chainFormMode === 'json-import' && (
              <button
                className="confirm-btn"
                onClick={handleImportChainsJson}
                disabled={importingChains || !chainJsonText.trim()}
              >{importingChains ? '导入中…' : '确认导入'}</button>
            )}
            <button
              className="chain-modal-close"
              onClick={chainFormMode !== 'none'
                ? () => { setChainFormMode('none'); setEditingChain(null); }
                : viewingChain
                ? () => setViewingChain(null)
                : () => { onClose(); setPendingDeleteChain(null); }
              }
            >{(chainFormMode !== 'none' || viewingChain) ? '←' : '×'}</button>
          </div>
        </div>

        <div className="chain-modal-body">
          {/* JSON Import form */}
          {chainFormMode === 'json-import' && (
            <div className="chain-form">
              <div className="chain-json-hint">
                <span>粘贴 JSON 数组，每项包含 <code>title</code> 和 <code>content</code> 字段：</span>
                <pre className="chain-json-example">{`[
  {
    "title": "锂电池业务",
    "content": "上游：..."
  },
  {
    "title": "光伏业务",
    "content": "上游：..."
  }
]`}</pre>
              </div>
              <textarea
                className="chain-form-content-textarea chain-json-textarea"
                placeholder="在此粘贴 JSON…"
                value={chainJsonText}
                onChange={e => { setChainJsonText(e.target.value); setChainJsonError(''); }}
                rows={14}
                spellCheck={false}
                autoFocus
              />
              {chainJsonError && (
                <div className="chain-json-error">{chainJsonError}</div>
              )}
            </div>
          )}

          {/* Read view */}
          {viewingChain && chainFormMode === 'none' && (
            <div className="chain-item-content chain-read-view">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} urlTransform={url => url}>{autoFenceBoxArt(viewingChain.content)}</ReactMarkdown>
            </div>
          )}

          {/* Add / Edit form */}
          {(chainFormMode === 'add' || chainFormMode === 'edit') && (
            <div className="chain-form">
              <input
                className="chain-form-title-input"
                placeholder="业务线名称（如：锂电池业务、光伏业务）"
                value={chainFormTitle}
                onChange={e => setChainFormTitle(e.target.value)}
                autoFocus
              />
              <textarea
                className="chain-form-content-textarea"
                placeholder="产业链示意图（支持 Markdown + 文字图表）"
                value={chainFormContent}
                onChange={e => setChainFormContent(e.target.value)}
                rows={18}
                spellCheck={false}
              />
            </div>
          )}

          {/* List */}
          {chainFormMode === 'none' && !viewingChain && (
            <div className="chain-list">
              {loadingChains ? (
                <div className="chain-list-empty">加载中…</div>
              ) : industryChains.length === 0 ? (
                <div className="chain-list-empty">
                  <span className="chain-empty-icon">◇</span>
                  <span>暂无产业链，点击「+ 添加业务线」开始整理</span>
                </div>
              ) : (
                industryChains.map(chain => (
                  <div key={chain.id} className="chain-item">
                    <div className="chain-item-header">
                      <button
                        className="chain-item-toggle"
                        onClick={() => setViewingChain(chain)}
                      >
                        <span className="chain-item-title">{chain.title}</span>
                        <span className="chain-item-arrow">▶</span>
                      </button>
                      <div className="chain-item-actions">
                        {pendingDeleteChain?.id === chain.id ? (
                          <>
                            <span className="chain-delete-confirm-text">确认删除？</span>
                            <button className="chain-item-btn chain-item-btn-danger" onClick={() => handleDeleteChain(chain)}>删除</button>
                            <button className="chain-item-btn" onClick={() => setPendingDeleteChain(null)}>取消</button>
                          </>
                        ) : (
                          <button className="chain-item-btn chain-item-btn-danger" onClick={() => setPendingDeleteChain(chain)}>删除</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
