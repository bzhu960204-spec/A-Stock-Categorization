import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { marked } from 'marked';
import { DocEditor, type DocEditorHandle } from './DocEditor';
import {
  getStockDocuments, createStockDocument, updateStockDocument, deleteStockDocument, uploadDocImage,
  getEarningsReports, createEarningsReport, updateEarningsReport, deleteEarningsReport,
  type Stock, type StockDocument, type EarningsReport,
} from './api';

type UnifiedDocItem =
  | { kind: 'doc'; data: StockDocument }
  | { kind: 'earnings'; data: EarningsReport };

// Before saving: upload any data: URIs to the backend and replace with real URLs
async function processImagesBeforeSave(html: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const images = Array.from(doc.querySelectorAll('img[src^="data:image/"]'));
  for (const img of images) {
    const dataUrl = img.getAttribute('src')!;
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'image.png', { type: blob.type });
      const url = await uploadDocImage(file);
      img.setAttribute('src', url);
    } catch {
      // keep data URI if upload fails — document still saves
    }
  }
  return doc.body.innerHTML;
}

interface DocumentCenterModalProps {
  stock: Stock;
  onClose: () => void;
}

export function DocumentCenterModal({ stock, onClose }: DocumentCenterModalProps) {
  const [documents, setDocuments] = useState<StockDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [docViewMode, setDocViewMode] = useState<'list' | 'read' | 'edit' | 'compose' | 'earnings-read' | 'earnings-compose' | 'earnings-edit'>('list');
  const [selectedDocument, setSelectedDocument] = useState<StockDocument | null>(null);
  const [editDocTitle, setEditDocTitle] = useState('');
  const [editDocContent, setEditDocContent] = useState('');
  const [editDocCategory, setEditDocCategory] = useState('');
  const editDocContentRef = useRef('');  // always tracks latest content even if state lags
  const [docSaveError, setDocSaveError] = useState('');
  const [savingDocument, setSavingDocument] = useState(false);
  const docEditorRef = useRef<DocEditorHandle>(null);
  // 日志列表过滤
  const [docCategoryFilter, setDocCategoryFilter] = useState('全部');
  const [docTitleFilter, setDocTitleFilter] = useState('');
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<StockDocument | null>(null);

  // Earnings Report state (merged into the unified document panel)
  const [earningsReports, setEarningsReports] = useState<EarningsReport[]>([]);
  const [selectedEarnings, setSelectedEarnings] = useState<EarningsReport | null>(null);
  const [earningsFormTitle, setEarningsFormTitle] = useState('');
  const [earningsFormPeriod, setEarningsFormPeriod] = useState('');
  const [earningsFormResult, setEarningsFormResult] = useState<'BEAT' | 'MISS' | 'IN_LINE' | ''>('');
  const [earningsFormDate, setEarningsFormDate] = useState('');
  const [earningsFormContent, setEarningsFormContent] = useState('');
  const earningsFormContentRef = useRef('');
  const [earningsSaveError, setEarningsSaveError] = useState('');
  const [savingEarnings, setSavingEarnings] = useState(false);
  const [pendingDeleteEarnings, setPendingDeleteEarnings] = useState<EarningsReport | null>(null);
  const earningsEditorRef = useRef<DocEditorHandle>(null);

  // Load documents + earnings whenever the target stock changes.
  useEffect(() => {
    let cancelled = false;
    setDocuments([]);
    setEarningsReports([]);
    setDocViewMode('list');
    setSelectedDocument(null);
    setSelectedEarnings(null);
    setEditDocTitle('');
    setEditDocContent('');
    setEditDocCategory('');
    setDocCategoryFilter('全部');
    setDocTitleFilter('');
    setPendingDeleteDoc(null);
    setPendingDeleteEarnings(null);
    setDocumentsLoading(true);
    (async () => {
      try {
        const [docRes, earningsRes] = await Promise.all([
          getStockDocuments(stock.id),
          getEarningsReports(stock.id),
        ]);
        if (cancelled) return;
        setDocuments(docRes.data);
        setEarningsReports(earningsRes.data);
      } catch (e) {
        console.error('Failed to load stock documents', e);
        if (cancelled) return;
        setDocuments([]);
        setEarningsReports([]);
      } finally {
        if (!cancelled) setDocumentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [stock.id]);

  const handleAddDocument = async () => {
    const title = editDocTitle.trim();
    const rawContent = (editDocContentRef.current || editDocContent).trim();
    if (!title) { setDocSaveError('请填写日志标题'); return; }
    if (!rawContent) { setDocSaveError('日志内容不能为空'); return; }

    setDocSaveError('');
    setSavingDocument(true);
    try {
      const content = await processImagesBeforeSave(rawContent);
      const res = await createStockDocument(stock.id, { title, content, category: editDocCategory.trim() || undefined });
      setDocuments(prev => [res.data, ...prev]);
      setEditDocTitle('');
      setEditDocContent('');
      editDocContentRef.current = '';
      setDocViewMode('list');
    } catch (e) {
      console.error('Failed to create stock document', e);
      setDocSaveError('保存失败，请检查后端是否运行');
    } finally {
      setSavingDocument(false);
    }
  };

  const handleUpdateDocument = async () => {
    if (!selectedDocument) return;
    const title = editDocTitle.trim();
    const rawContent = (editDocContentRef.current || editDocContent).trim();
    if (!title) { setDocSaveError('请填写日志标题'); return; }
    if (!rawContent) { setDocSaveError('日志内容不能为空'); return; }

    setDocSaveError('');
    setSavingDocument(true);
    try {
      const content = await processImagesBeforeSave(rawContent);
      const res = await updateStockDocument(stock.id, selectedDocument.id, { title, content, category: editDocCategory.trim() || undefined });
      setDocuments(prev => prev.map(d => d.id === res.data.id ? res.data : d));
      setSelectedDocument(res.data);
      setDocViewMode('read');
    } catch (e) {
      console.error('Failed to update document', e);
      setDocSaveError('保存失败，请检查后端是否运行');
    } finally {
      setSavingDocument(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!pendingDeleteDoc) return;
    setSavingDocument(true);
    try {
      await deleteStockDocument(stock.id, pendingDeleteDoc.id);
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

  const handleAddEarnings = async () => {
    const title = earningsFormTitle.trim();
    if (!title) { setEarningsSaveError('请填写财报标题'); return; }
    const rawContent = (earningsFormContentRef.current || earningsFormContent).trim();
    setEarningsSaveError('');
    setSavingEarnings(true);
    try {
      const content = rawContent ? await processImagesBeforeSave(rawContent) : '';
      const res = await createEarningsReport(stock.id, {
        title,
        fiscalPeriod: earningsFormPeriod || undefined,
        result: (earningsFormResult as EarningsReport['result']) || undefined,
        reportDate: earningsFormDate || undefined,
        content,
      });
      setEarningsReports(prev => [res.data, ...prev]);
      setDocViewMode('list');
    } catch (e) {
      console.error('Failed to create earnings report', e);
      setEarningsSaveError('保存失败，请检查后端是否运行');
    } finally {
      setSavingEarnings(false);
    }
  };

  const openEarningsCompose = () => {
    setEarningsFormTitle('');
    setEarningsFormPeriod('');
    setEarningsFormResult('');
    setEarningsFormDate('');
    setEarningsFormContent('');
    earningsFormContentRef.current = '';
    setEarningsSaveError('');
    setDocViewMode('earnings-compose');
  };

  const openEarningsEdit = (report: EarningsReport) => {
    const raw = report.content ?? '';
    const html = raw.trimStart().startsWith('<') ? raw : String(marked.parse(raw));
    setEarningsFormTitle(report.title);
    setEarningsFormPeriod(report.fiscalPeriod ?? '');
    setEarningsFormResult(report.result ?? '');
    setEarningsFormDate(report.reportDate ?? '');
    setEarningsFormContent(html);
    earningsFormContentRef.current = html;
    setEarningsSaveError('');
    setDocViewMode('earnings-edit');
  };

  const handleUpdateEarnings = async () => {
    if (!selectedEarnings) return;
    const title = earningsFormTitle.trim();
    if (!title) { setEarningsSaveError('请填写财报标题'); return; }
    const rawContent = (earningsFormContentRef.current || earningsFormContent).trim();
    setEarningsSaveError('');
    setSavingEarnings(true);
    try {
      const content = rawContent ? await processImagesBeforeSave(rawContent) : '';
      const res = await updateEarningsReport(stock.id, selectedEarnings.id, {
        title,
        fiscalPeriod: earningsFormPeriod || undefined,
        result: (earningsFormResult as EarningsReport['result']) || undefined,
        reportDate: earningsFormDate || undefined,
        content,
      });
      setEarningsReports(prev => prev.map(r => r.id === res.data.id ? res.data : r));
      setSelectedEarnings(res.data);
      setDocViewMode('earnings-read');
    } catch (e) {
      console.error('Failed to update earnings report', e);
      setEarningsSaveError('保存失败，请检查后端是否运行');
    } finally {
      setSavingEarnings(false);
    }
  };

  const handleDeleteEarnings = async () => {
    if (!pendingDeleteEarnings) return;
    setSavingEarnings(true);
    try {
      await deleteEarningsReport(stock.id, pendingDeleteEarnings.id);
      setEarningsReports(prev => prev.filter(r => r.id !== pendingDeleteEarnings.id));
      setPendingDeleteEarnings(null);
      setSelectedEarnings(null);
      setDocViewMode('list');
    } catch (e) {
      console.error('Failed to delete earnings report', e);
    } finally {
      setSavingEarnings(false);
    }
  };

  const allDocItems: UnifiedDocItem[] = [
    ...documents.map(d => ({ kind: 'doc' as const, data: d })),
    ...earningsReports.map(e => ({ kind: 'earnings' as const, data: e })),
  ].sort((a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime());

  const docFilterCategories = ['全部', '财报', ...Array.from(new Set(
    documents.map(d => d.category).filter((c): c is string => !!c)
  ))].filter((v, i, arr) => arr.indexOf(v) === i);

  const filteredDocItems = allDocItems.filter(item => {
    const cat = item.kind === 'earnings' ? '财报' : (item.data.category || '');
    const catOk = docCategoryFilter === '全部' || cat === docCategoryFilter;
    const kw = docTitleFilter.trim().toLowerCase();
    const content = item.kind === 'earnings'
      ? ((item.data as EarningsReport).content || '')
      : (item.data as StockDocument).content;
    const titleOk = !kw
      || item.data.title.toLowerCase().includes(kw)
      || content.replace(/<[^>]*>/g, '').toLowerCase().includes(kw);
    return catOk && titleOk;
  });

  const closeGuarded = () => {
    const isEditing = savingDocument
      || docViewMode === 'edit' || docViewMode === 'compose'
      || docViewMode === 'earnings-edit' || docViewMode === 'earnings-compose';
    if (isEditing) return;
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={closeGuarded}>
      <div className="glass-modal document-modal" onClick={e => e.stopPropagation()}>

        {/* ---- List View ---- */}
        {docViewMode === 'list' && (
          <>
            <div className="doc-modal-header">
              <div className="doc-modal-title-row">
                <h2>{stock.code} {stock.name}</h2>
                <span className="doc-modal-subtitle">研究日志</span>
              </div>
              <button
                className="doc-new-btn"
                onClick={() => { setEditDocTitle(''); setEditDocContent(''); setEditDocCategory(docCategoryFilter !== '全部' && docCategoryFilter !== '财报' ? docCategoryFilter : ''); setDocViewMode('compose'); }}
                disabled={savingDocument}
              >+ 新建日志</button>
              <button
                className="doc-new-btn"
                onClick={openEarningsCompose}
                disabled={savingDocument}
              >+ 新建财报</button>
            </div>

            {/* 过滤栏 */}
            <div className="doc-filter-bar">
              <div className="doc-category-pills">
                {docFilterCategories.map(cat => (
                  <button
                    key={cat}
                    className={`doc-category-pill${docCategoryFilter === cat ? ' active' : ''}`}
                    onClick={() => setDocCategoryFilter(cat)}
                  >{cat}</button>
                ))}
              </div>
            </div>
            <div className="doc-search-bar">
              <input
                className="doc-title-search"
                type="text"
                placeholder="搜索标题或内容…"
                value={docTitleFilter}
                onChange={e => setDocTitleFilter(e.target.value)}
              />
              {docTitleFilter && (
                <button className="doc-search-clear" onClick={() => setDocTitleFilter('')}>×</button>
              )}
            </div>

            <div className="doc-list-scroll">
              {documentsLoading ? (
                <div className="timeline-empty">加载中...</div>
              ) : filteredDocItems.length === 0 ? (
                <div className="doc-empty-state">
                  <div className="doc-empty-icon">{allDocItems.length === 0 ? '📓' : '🔍'}</div>
                  <p>{allDocItems.length === 0 ? '还没有日志' : '没有匹配的记录'}</p>
                  <p className="doc-empty-sub">{allDocItems.length === 0 ? '点击「新建日志」或「新建财报」开始记录' : '请调整搜索或分类过滤条件'}</p>
                </div>
              ) : (
                <div className="doc-list">
                  {filteredDocItems.map(item => {
                    const isEarnings = item.kind === 'earnings';
                    const title = item.data.title;
                    const createdAt = item.data.createdAt;
                    const category = isEarnings ? '财报' : ((item.data as StockDocument).category || '');
                    const rawContent = isEarnings ? ((item.data as EarningsReport).content || '') : (item.data as StockDocument).content;
                    const cleanContent = rawContent.trimStart().startsWith('<')
                      ? rawContent.replace(/<[^>]*>/g, '')
                      : rawContent.replace(/[#*`>\-_~\[\]()]/g, '');
                    const preview = cleanContent.trim().slice(0, 120);
                    const dt = new Date(createdAt);
                    const timeStr = dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

                    // Earnings-specific badges
                    let resultLabel: string | null = null;
                    let resultClass = '';
                    if (isEarnings) {
                      const r = (item.data as EarningsReport).result;
                      resultLabel = r === 'BEAT' ? '超预期' : r === 'MISS' ? '低预期' : r === 'IN_LINE' ? '符合预期' : null;
                      resultClass = r === 'BEAT' ? 'earnings-beat' : r === 'MISS' ? 'earnings-miss' : r === 'IN_LINE' ? 'earnings-inline' : '';
                    }

                    return (
                      <article
                        key={`${item.kind}-${item.data.id}`}
                        className="doc-card"
                        onClick={() => {
                          if (isEarnings) {
                            setSelectedEarnings(item.data as EarningsReport);
                            setDocViewMode('earnings-read');
                          } else {
                            setSelectedDocument(item.data as StockDocument);
                            setDocViewMode('read');
                          }
                        }}
                      >
                        <div className="doc-card-date">
                          <span className="doc-card-day">{dt.getDate()}</span>
                          <span className="doc-card-month">{dt.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' })}</span>
                        </div>
                        <div className="doc-card-body">
                          <div className="doc-card-title-row">
                            <h3 className="doc-card-title">{title}</h3>
                            {category && <span className={`doc-category-badge${isEarnings ? ' earnings-cat' : ''}`}>{category}</span>}
                            {resultLabel && <span className={`earnings-result-badge ${resultClass}`}>{resultLabel}</span>}
                          </div>
                          <p className="doc-card-preview">{preview}{rawContent.length > 120 ? '…' : ''}</p>
                          <div className="doc-card-meta">
                            <span>{timeStr}</span>
                            {isEarnings && (item.data as EarningsReport).fiscalPeriod && <span>{(item.data as EarningsReport).fiscalPeriod}</span>}
                            {isEarnings && (item.data as EarningsReport).reportDate && <span>发布：{(item.data as EarningsReport).reportDate}</span>}
                            {!isEarnings && <span>{rawContent.length} 字</span>}
                            {!isEarnings && (item.data as StockDocument).updatedAt !== createdAt && <span>已编辑</span>}
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
              <button className="cancel-btn" onClick={onClose}>关闭</button>
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
                  const raw = selectedDocument.content;
                  // Convert legacy Markdown to HTML for Tiptap
                  const html = raw.trimStart().startsWith('<')
                    ? raw
                    : String(marked.parse(raw));
                  setEditDocTitle(selectedDocument.title);
                  setEditDocCategory(selectedDocument.category || '');
                  setEditDocContent(html);
                  editDocContentRef.current = html;
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
                {selectedDocument.category && (
                  <span className="doc-category-badge">{selectedDocument.category}</span>
                )}
              </div>
              <h1 className="doc-read-title">{selectedDocument.title}</h1>
              {selectedDocument.content.trimStart().startsWith('<') ? (
                <DocEditor value={selectedDocument.content} onChange={() => {}} readonly />
              ) : (
                <div className="doc-markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} urlTransform={url => url}>{selectedDocument.content}</ReactMarkdown>
                </div>
              )}
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
            <div className="rp-modal-header">
              <div className="rp-modal-header-left doc-compose-edit-meta">
                <div className="doc-compose-header-top">
                  <button className="doc-back-btn" onClick={() => {
                    if (docViewMode === 'edit') { setDocViewMode('read'); }
                    else { setDocViewMode('list'); }
                  }}>‹ {docViewMode === 'edit' ? '返回阅读' : '返回列表'}</button>
                  <span className="rp-modal-title-display" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {docViewMode === 'edit' ? '编辑日志' : '新建日志'}
                  </span>
                </div>
                <div className="doc-compose-title-row">
                  <input
                    className="rp-modal-title-input"
                    type="text"
                    placeholder="日志标题，例如：2026Q1 业绩复盘"
                    value={editDocTitle}
                    onChange={e => { setEditDocTitle(e.target.value); if (docSaveError) setDocSaveError(''); }}
                    autoFocus
                  />
                </div>
                <div className="doc-compose-category-row">
                  <label className="doc-compose-category-label">分类：</label>
                  <input
                    className="doc-compose-category-input"
                    type="text"
                    list="doc-category-presets"
                    placeholder="留空 / 财报 / 调研 / 观察…"
                    value={editDocCategory}
                    onChange={e => setEditDocCategory(e.target.value)}
                  />
                  <datalist id="doc-category-presets">
                    {docFilterCategories.filter(c => c !== '全部').map(c => (
                      <option key={c} value={c} />
                    ))}
                    <option value="财报" />
                    <option value="调研" />
                    <option value="观察" />
                    <option value="会议纪要" />
                  </datalist>
                </div>
              </div>
              <div className="rp-modal-header-right">
                {docSaveError && <span className="doc-save-error" style={{ flex: 'unset' }}>{docSaveError}</span>}
                <button className="cancel-btn" onClick={() => {
                  if (docViewMode === 'edit') setDocViewMode('read');
                  else setDocViewMode('list');
                }} disabled={savingDocument}>取消</button>
                <button
                  className="confirm-btn"
                  onClick={docViewMode === 'edit' ? handleUpdateDocument : handleAddDocument}
                  disabled={savingDocument}
                >{savingDocument ? '保存中...' : '保存日志'}</button>
              </div>
            </div>

            <div className="rp-modal-body">
              <div className="rp-modal-editor-wrap">
                <DocEditor
                  ref={docEditorRef}
                  value={editDocContent}
                  onChange={v => {
                    editDocContentRef.current = v;
                    setEditDocContent(v);
                  }}
                />
              </div>
            </div>
          </>
        )}

        {/* ---- Earnings Read View ---- */}
        {docViewMode === 'earnings-read' && selectedEarnings && (
          <>
            <div className="doc-modal-header">
              <button className="doc-back-btn" onClick={() => setDocViewMode('list')}>‹ 返回列表</button>
              <div className="doc-read-actions">
                <button className="doc-action-edit" onClick={() => openEarningsEdit(selectedEarnings)}>编辑</button>
                <button className="doc-action-delete" onClick={() => setPendingDeleteEarnings(selectedEarnings)}>删除</button>
              </div>
            </div>

            <div className="doc-read-scroll">
              <div className="doc-read-meta">
                <time>{new Date(selectedEarnings.createdAt).toLocaleString('zh-CN', { hour12: false })}</time>
                {selectedEarnings.updatedAt !== selectedEarnings.createdAt && (
                  <span className="doc-read-edited">已编辑 · {new Date(selectedEarnings.updatedAt).toLocaleString('zh-CN', { hour12: false })}</span>
                )}
                <span className="doc-category-badge earnings-cat">财报</span>
              </div>
              <div className="earnings-read-header">
                <h1 className="doc-read-title">{selectedEarnings.title}</h1>
                <div className="earnings-read-meta-row">
                  {selectedEarnings.result && (
                    <span className={`earnings-result-badge large ${selectedEarnings.result === 'BEAT' ? 'earnings-beat' : selectedEarnings.result === 'MISS' ? 'earnings-miss' : 'earnings-inline'}`}>
                      {selectedEarnings.result === 'BEAT' ? '超预期 Beat' : selectedEarnings.result === 'MISS' ? '低预期 Miss' : '符合预期 In-line'}
                    </span>
                  )}
                  {selectedEarnings.fiscalPeriod && <span className="earnings-meta-chip">{selectedEarnings.fiscalPeriod}</span>}
                  {selectedEarnings.reportDate && <span className="earnings-meta-chip">📅 {selectedEarnings.reportDate}</span>}
                </div>
              </div>
              {selectedEarnings.content?.trim() ? (
                selectedEarnings.content.trimStart().startsWith('<') ? (
                  <DocEditor value={selectedEarnings.content} onChange={() => {}} readonly />
                ) : (
                  <div className="doc-markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} urlTransform={url => url}>{selectedEarnings.content}</ReactMarkdown>
                  </div>
                )
              ) : (
                <div className="profile-section-empty" style={{ marginTop: 24 }}>
                  <span>暂无详细记录</span>
                </div>
              )}
            </div>

            <div className="modal-actions sticky-actions">
              <button className="cancel-btn" onClick={() => setDocViewMode('list')}>返回列表</button>
            </div>

            {pendingDeleteEarnings && (
              <div className="modal-overlay" onClick={() => !savingEarnings && setPendingDeleteEarnings(null)}>
                <div className="glass-modal delete-confirm-modal" onClick={e => e.stopPropagation()}>
                  <h2>确认删除财报记录</h2>
                  <div className="delete-confirm-body">
                    <p className="delete-confirm-text">将要删除：</p>
                    <p className="delete-confirm-target">《{pendingDeleteEarnings.title}》</p>
                    <p className="delete-confirm-sub">此操作不可撤销。</p>
                  </div>
                  <div className="modal-actions">
                    <button className="cancel-btn" onClick={() => setPendingDeleteEarnings(null)} disabled={savingEarnings}>取消</button>
                    <button className="confirm-btn danger" onClick={handleDeleteEarnings} disabled={savingEarnings}>
                      {savingEarnings ? '删除中...' : '确认删除'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- Earnings Compose / Edit View ---- */}
        {(docViewMode === 'earnings-compose' || docViewMode === 'earnings-edit') && (
          <>
            <div className="rp-modal-header">
              <div className="rp-modal-header-left doc-compose-edit-meta">
                <div className="doc-compose-header-top">
                  <button className="doc-back-btn" onClick={() => {
                    if (docViewMode === 'earnings-edit') setDocViewMode('earnings-read');
                    else setDocViewMode('list');
                  }}>‹ {docViewMode === 'earnings-edit' ? '返回阅读' : '返回列表'}</button>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {docViewMode === 'earnings-edit' ? '编辑财报记录' : '新建财报记录'}
                  </span>
                </div>
                <div className="doc-compose-title-row">
                  <input
                    className="rp-modal-title-input"
                    type="text"
                    placeholder="财报标题，例如：2026Q1 业绩超预期"
                    value={earningsFormTitle}
                    onChange={e => { setEarningsFormTitle(e.target.value); if (earningsSaveError) setEarningsSaveError(''); }}
                    autoFocus
                  />
                </div>
                <div className="earnings-form-meta-row">
                  <input
                    className="earnings-meta-input"
                    type="text"
                    placeholder="财报期，如 2026Q1"
                    value={earningsFormPeriod}
                    onChange={e => setEarningsFormPeriod(e.target.value)}
                  />
                  <select
                    className="earnings-meta-select"
                    value={earningsFormResult}
                    onChange={e => setEarningsFormResult(e.target.value as 'BEAT' | 'MISS' | 'IN_LINE' | '')}
                  >
                    <option value="">-- 结果 --</option>
                    <option value="BEAT">超预期 Beat</option>
                    <option value="IN_LINE">符合预期 In-line</option>
                    <option value="MISS">低预期 Miss</option>
                  </select>
                  <input
                    className="earnings-meta-input"
                    type="date"
                    title="财报发布日期"
                    value={earningsFormDate}
                    onChange={e => setEarningsFormDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="rp-modal-header-right">
                {earningsSaveError && <span className="doc-save-error" style={{ flex: 'unset' }}>{earningsSaveError}</span>}
                <button className="cancel-btn" onClick={() => {
                  if (docViewMode === 'earnings-edit') setDocViewMode('earnings-read');
                  else setDocViewMode('list');
                }} disabled={savingEarnings}>取消</button>
                <button
                  className="confirm-btn"
                  onClick={docViewMode === 'earnings-edit' ? handleUpdateEarnings : handleAddEarnings}
                  disabled={savingEarnings}
                >{savingEarnings ? '保存中...' : '保存财报'}</button>
              </div>
            </div>

            <div className="rp-modal-body">
              <div className="rp-modal-editor-wrap">
                <DocEditor
                  ref={earningsEditorRef}
                  value={earningsFormContent}
                  onChange={v => {
                    earningsFormContentRef.current = v;
                    setEarningsFormContent(v);
                  }}
                />
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
