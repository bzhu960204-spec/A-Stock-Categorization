import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DocEditor, type DocEditorHandle } from './DocEditor';
import {
  getSectors, createSector, updateSector, deleteSector,
  getSectorReports, createSectorReport, updateSectorReport, deleteSectorReport,
  updateSectorReportRating, searchSectorReports,
  type Sector, type SectorReport,
} from './api';
import './App.css';

interface ResearchModuleProps {
  onGoHome: () => void;
}

export default function ResearchModule({ onGoHome }: ResearchModuleProps) {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedSector, setSelectedSector] = useState<Sector | null>(null);
  const [reports, setReports] = useState<SectorReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Sector editing
  const [showAddSector, setShowAddSector] = useState(false);
  const [newSectorName, setNewSectorName] = useState('');
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [editSectorName, setEditSectorName] = useState('');
  const [sectorSearchQuery, setSectorSearchQuery] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'read' | 'edit'>('read');
  const [modalReport, setModalReport] = useState<SectorReport | null>(null);

  // Search & filter
  const [search, setSearch] = useState('');
  const [starFilter, setStarFilter] = useState(0); // 0 = all, 1-5 = at least N stars

  // Search scope: 'local' = within selected sector, 'global' = all sectors
  const [searchScope, setSearchScope] = useState<'local' | 'global'>('global');
  const [globalResults, setGlobalResults] = useState<SectorReport[]>([]);
  const [globalSearching, setGlobalSearching] = useState(false);

  // Edit form state (inside modal)
  const [editTitle, setEditTitle] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editReportDate, setEditReportDate] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editContent, setEditContent] = useState('');

  // Category filter for local reports
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const editContentRef = useRef('');
  const [savingReport, setSavingReport] = useState(false);
  const [saveError, setSaveError] = useState('');

  const docEditorRef = useRef<DocEditorHandle>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && modalOpen && modalMode !== 'edit') closeModal(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalOpen]);

  const loadSectors = useCallback(async () => {
    const res = await getSectors();
    setSectors(res.data);
  }, []);

  useEffect(() => { loadSectors(); }, [loadSectors]);

  const loadReports = useCallback(async (sectorId: number) => {
    setLoadingReports(true);
    try {
      const res = await getSectorReports(sectorId);
      setReports(res.data);
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSector) {
      loadReports(selectedSector.id);
      setSearchScope('local');
    } else {
      setReports([]);
      setSearchScope('global');
    }
    setSearch('');
    setStarFilter(0);
    setCategoryFilter('全部');
    setGlobalResults([]);
  }, [selectedSector, loadReports]);

  // Debounced global search (runs when scope is 'global')
  useEffect(() => {
    if (searchScope !== 'global') { setGlobalResults([]); return; }
    const kw = search.trim();
    if (!kw) { setGlobalResults([]); return; }
    const timer = setTimeout(async () => {
      setGlobalSearching(true);
      try {
        const res = await searchSectorReports(kw);
        setGlobalResults(res.data);
      } finally {
        setGlobalSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchScope]);

  const reportCategories = useMemo(() =>
    ['全部', ...Array.from(new Set(reports.map(r => r.category).filter((c): c is string => !!c)))],
    [reports]
  );

  const filteredReports = useMemo(() => {
    let list = reports;
    if (categoryFilter !== '全部') list = list.filter(r => (r.category || '') === categoryFilter);
    if (starFilter > 0) list = list.filter(r => (r.rating ?? 0) >= starFilter);
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      list = list.filter(r =>
        r.title.toLowerCase().includes(kw) ||
        (r.source ?? '').toLowerCase().includes(kw) ||
        (r.reportDate ?? '').includes(kw)
      );
    }
    return list;
  }, [reports, search, starFilter, categoryFilter]);

  const handleAddSector = async () => {
    if (!newSectorName.trim()) return;
    await createSector({ name: newSectorName.trim() });
    setNewSectorName('');
    setShowAddSector(false);
    await loadSectors();
  };

  const handleUpdateSector = async () => {
    if (!editingSector || !editSectorName.trim()) return;
    await updateSector(editingSector.id, { name: editSectorName.trim() });
    setEditingSector(null);
    await loadSectors();
  };

  const handleDeleteSector = async (sector: Sector) => {
    if (!window.confirm(`确定删除行业「${sector.name}」？此操作不可恢复。`)) return;
    try {
      await deleteSector(sector.id);
      if (selectedSector?.id === sector.id) setSelectedSector(null);
      await loadSectors();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        alert(`无法删除「${sector.name}」，该行业下还有研报，请先删除所有研报后再删除行业。`);
      } else {
        alert('删除失败，请重试。');
      }
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalReport(null);
    setSaveError('');
  };

  const openReadModal = (report: SectorReport) => {
    setModalReport(report);
    setModalMode('read');
    setModalOpen(true);
  };

  const openNewModal = () => {
    setModalReport(null);
    setEditTitle('');
    setEditSource('');
    setEditReportDate('');
    setEditCategory(categoryFilter !== '全部' ? categoryFilter : '');
    setEditContent('');
    editContentRef.current = '';
    setSaveError('');
    setModalMode('edit');
    setModalOpen(true);
  };

  const switchToEdit = (report: SectorReport) => {
    setEditTitle(report.title);
    setEditSource(report.source || '');
    setEditReportDate(report.reportDate || '');
    setEditCategory(report.category || '');
    setEditContent(report.content || '');
    editContentRef.current = report.content || '';
    setSaveError('');
    setModalMode('edit');
  };

  const handleSaveReport = async () => {
    if (!selectedSector) return;
    if (!editTitle.trim()) { setSaveError('请填写报告标题'); return; }
    setSavingReport(true);
    setSaveError('');
    try {
      const payload = {
        title: editTitle.trim(),
        content: editContentRef.current,
        source: editSource.trim() || undefined,
        reportDate: editReportDate.trim() || undefined,
        category: editCategory.trim() || undefined,
      };
      let saved: SectorReport;
      if (!modalReport) {
        const res = await createSectorReport(selectedSector.id, payload);
        saved = res.data;
      } else {
        const res = await updateSectorReport(selectedSector.id, modalReport.id, payload);
        saved = res.data;
      }
      await loadReports(selectedSector.id);
      setModalReport(saved);
      setModalMode('read');
    } catch {
      setSaveError('保存失败，请重试。');
    } finally {
      setSavingReport(false);
    }
  };

  const handleDeleteReport = async (report: SectorReport, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!selectedSector) return;
    if (!window.confirm(`确定删除研报「${report.title}」？`)) return;
    await deleteSectorReport(selectedSector.id, report.id);
    await loadReports(selectedSector.id);
    if (modalReport?.id === report.id) closeModal();
  };

  const handleRating = async (report: SectorReport, n: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedSector) return;
    const newRating = (report.rating ?? 0) === n ? 0 : n;
    try {
      const res = await updateSectorReportRating(selectedSector.id, report.id, newRating);
      setReports(prev => prev.map(r => r.id === report.id ? res.data : r));
      if (modalReport?.id === report.id) setModalReport(res.data);
    } catch (err) { console.error(err); }
  };

  const stripHtml = (html: string) =>
    html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);

  const handleExportPdf = (report: SectorReport) => {
    const stars = '★'.repeat(report.rating ?? 0) + '☆'.repeat(5 - (report.rating ?? 0));
    const metaParts = [
      report.sectorName ? `行业：${report.sectorName}` : (selectedSector ? `行业：${selectedSector.name}` : ''),
      report.source ? `来源：${report.source}` : '',
      report.reportDate ? `报告日期：${report.reportDate}` : '',
      report.createdAt ? `录入日期：${new Date(report.createdAt).toLocaleDateString('zh-CN')}` : '',
    ].filter(Boolean).join('　|　');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${report.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "PingFang SC", "Microsoft YaHei", "SimSun", sans-serif; font-size: 14px; color: #1a1a1a; background: #fff; padding: 40px 48px; }
    .report-title { font-size: 22px; font-weight: 700; line-height: 1.4; margin-bottom: 10px; }
    .report-stars { font-size: 18px; color: #f5a623; letter-spacing: 2px; margin-bottom: 6px; }
    .report-meta { font-size: 12px; color: #666; border-bottom: 1px solid #e0e0e0; padding-bottom: 10px; margin-bottom: 24px; }
    .report-content { line-height: 1.8; }
    .report-content p { margin-bottom: 0.8em; }
    .report-content h1, .report-content h2, .report-content h3 { margin: 1em 0 0.5em; font-weight: 600; }
    .report-content ul, .report-content ol { margin: 0.5em 0 0.8em 1.5em; }
    .report-content li { margin-bottom: 0.3em; }
    .report-content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    .report-content th, .report-content td { border: 1px solid #ccc; padding: 6px 10px; font-size: 13px; }
    .report-content th { background: #f5f5f5; font-weight: 600; }
    .report-content blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #555; margin: 0.8em 0; }
    .report-content strong { font-weight: 700; }
    .report-content em { font-style: italic; }
    @media print {
      body { padding: 20px 28px; }
      @page { size: A4; margin: 20mm 18mm; }
    }
  </style>
</head>
<body>
  <div class="report-title">${report.title}</div>
  <div class="report-stars">${stars}</div>
  <div class="report-meta">${metaParts}</div>
  <div class="report-content">${report.content || '<p>（无内容）</p>'}</div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  return (
    <div className="app-container">
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome} title="返回主页">⌂</button>
          <h1 className="app-title">Sector Research</h1>
        </div>
        <div className="header-right">
          <button className="icon-btn" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? 'LITE' : 'TERM'}
          </button>
        </div>
      </header>

      <main className="main-layout">
        {/* Sidebar: sectors */}
        <aside className="glass-sidebar">
          <div className="sidebar-section">
            <div className="section-header">
              <h3>行业</h3>
              <button className="small-btn" title="新增行业" onClick={() => setShowAddSector(true)}>+</button>
            </div>

            {showAddSector && (
              <div className="inline-add-row">
                <input
                  className="inline-input"
                  placeholder="行业名称"
                  value={newSectorName}
                  onChange={e => setNewSectorName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddSector();
                    if (e.key === 'Escape') { setShowAddSector(false); setNewSectorName(''); }
                  }}
                  autoFocus
                />
                <button className="small-btn" onClick={handleAddSector}>✓</button>
                <button className="small-btn" onClick={() => { setShowAddSector(false); setNewSectorName(''); }}>✕</button>
              </div>
            )}

            <div style={{ position: 'relative', marginBottom: '6px' }}>
              <input
                className="cat-filter-search-input"
                placeholder="过滤行业…"
                value={sectorSearchQuery}
                onChange={e => setSectorSearchQuery(e.target.value)}
              />
              {sectorSearchQuery && (
                <button className="cat-filter-search-clear" onClick={() => setSectorSearchQuery('')}>✕</button>
              )}
            </div>

            <div className="category-list">
              {sectors.filter(s => s.name.toLowerCase().includes(sectorSearchQuery.toLowerCase())).map(sector => (
                <div key={sector.id} className="category-chip-row">
                  {editingSector?.id === sector.id ? (
                    <div className="inline-add-row" style={{ flex: 1 }}>
                      <input
                        className="inline-input"
                        value={editSectorName}
                        onChange={e => setEditSectorName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleUpdateSector();
                          if (e.key === 'Escape') setEditingSector(null);
                        }}
                        autoFocus
                      />
                      <button className="small-btn" onClick={handleUpdateSector}>✓</button>
                      <button className="small-btn" onClick={() => setEditingSector(null)}>✕</button>
                    </div>
                  ) : (
                    <>
                      <button
                        className={`category-chip ${selectedSector?.id === sector.id ? 'selected' : ''}`}
                        style={{ '--chip-color': 'var(--accent)' } as React.CSSProperties}
                        onClick={() => setSelectedSector(sector)}
                      >
                        <span className="chip-name">{sector.name}</span>
                      </button>
                      <button className="chip-edit-btn" title="编辑"
                        onClick={() => { setEditingSector(sector); setEditSectorName(sector.name); }}>✎</button>
                      <button className="chip-edit-btn" title="删除" style={{ color: 'var(--danger)' }}
                        onClick={() => handleDeleteSector(sector)}>✕</button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {sectors.length === 0 && !showAddSector && (
              <p className="empty-hint">点击 + 新增行业</p>
            )}
          </div>
        </aside>

        {/* Main content */}
        <div className="main-content">
          <div className="rp-list-wrap">

            {/* Toolbar */}
            <div className="rp-toolbar">
              <span className="rp-toolbar-title">
                {searchScope === 'global' ? '全局搜索' : (selectedSector?.name ?? '全局搜索')}
              </span>
              {(searchScope === 'local' || search.trim()) && (
                <span className="rp-toolbar-count">
                  {searchScope === 'global'
                    ? (globalSearching ? '…' : `${globalResults.length} 篇`)
                    : `${filteredReports.length}/${reports.length} 篇`}
                </span>
              )}
              <div style={{ flex: 1 }} />
              {searchScope === 'local' && selectedSector && (
                <button className="rp-new-btn" onClick={openNewModal}>+ 新增研报</button>
              )}
            </div>

            {/* Unified filter bar */}
            <div className="rp-filter-bar">
              <div className="rp-search-wrap">
                <input
                  className="rp-search-input"
                  placeholder={searchScope === 'global'
                    ? '全局搜索研报标题 / 内容 / 来源…'
                    : '搜索标题 / 来源 / 日期…'}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {selectedSector && (
                  <button
                    className={`rp-scope-toggle${searchScope === 'global' ? ' active' : ''}`}
                    onClick={() => {
                      setSearchScope(prev => prev === 'local' ? 'global' : 'local');
                      setSearch('');
                      setGlobalResults([]);
                    }}
                    title={searchScope === 'local' ? '切换为全局搜索' : '切换为本行业搜索'}
                  >
                    {searchScope === 'local' ? '本行业' : '全局'}
                  </button>
                )}
              </div>
              {searchScope === 'local' && selectedSector && (
                <div className="rp-star-filters">
                  {[0, 1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      className={`rp-star-filter-btn${starFilter === n ? ' active' : ''}`}
                      onClick={() => setStarFilter(n)}
                      title={n === 0 ? '全部' : `${n}星及以上`}
                    >
                      {n === 0 ? '全部' : `${'★'.repeat(n)}`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category pills — local mode only */}
            {searchScope === 'local' && selectedSector && reportCategories.length > 1 && (
              <div className="doc-category-pills">
                {reportCategories.map(cat => (
                  <button
                    key={cat}
                    className={`doc-category-pill${categoryFilter === cat ? ' active' : ''}`}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Results */}
            {searchScope === 'global' ? (
              !search.trim() ? (
                !selectedSector ? (
                  <div className="research-empty-state">
                    <span>← 从左侧选择一个行业，或在搜索框中全局搜索</span>
                  </div>
                ) : (
                  <div className="research-empty-state">
                    <span>输入关键词以全局搜索研报</span>
                  </div>
                )
              ) : globalSearching ? (
                <div className="research-empty-state">搜索中…</div>
              ) : globalResults.length === 0 ? (
                <div className="research-empty-state">无匹配研报</div>
              ) : (
                <div className="rp-list">
                  {globalResults.map(report => (
                    <div key={report.id} className="rp-row" onClick={() => {
                      const sec = sectors.find(s => s.id === report.sectorId);
                      if (sec) setSelectedSector(sec);
                      openReadModal(report);
                    }}>
                      <div className="rp-row-main">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="rp-global-sector-tag">{report.sectorName}</span>
                          <span className="rp-row-title">{report.title}</span>
                        </div>
                        <span className="rp-row-preview">
                          {report.content ? stripHtml(report.content) : '（无内容）'}
                        </span>
                      </div>
                      <div className="rp-row-right">
                        <div className="rp-row-stars">
                          {[1, 2, 3, 4, 5].map(n => (
                            <span key={n} className={`star-btn${(report.rating ?? 0) >= n ? ' filled' : ''}`}>
                              {(report.rating ?? 0) >= n ? '★' : '☆'}
                            </span>
                          ))}
                        </div>
                        <span className="rp-row-date">
                          {new Date(report.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              !selectedSector ? (
                <div className="research-empty-state">
                  <span>← 从左侧选择一个行业</span>
                </div>
              ) : loadingReports ? (
                <div className="research-empty-state">加载中…</div>
              ) : reports.length === 0 ? (
                <div className="research-empty-state" style={{ flexDirection: 'column', gap: 14 }}>
                  <span style={{ fontSize: '2rem' }}>📋</span>
                  <span>暂无研报，点击「新增研报」开始记录</span>
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="research-empty-state">无匹配结果</div>
              ) : (
                <div className="rp-list">
                  {filteredReports.map(report => (
                    <div key={report.id} className="rp-row" onClick={() => openReadModal(report)}>
                      <div className="rp-row-main">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {report.category && <span className="rp-global-sector-tag">{report.category}</span>}
                          <span className="rp-row-title">{report.title}</span>
                        </div>
                        <span className="rp-row-preview">
                          {report.content ? stripHtml(report.content) : '（无内容）'}
                        </span>
                      </div>
                      <div className="rp-row-right">
                        <div className="rp-row-stars" onClick={e => e.stopPropagation()}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <span
                              key={n}
                              className={`star-btn${(report.rating ?? 0) >= n ? ' filled' : ''}`}
                              onClick={e => handleRating(report, n, e)}
                              title={`设为 ${n} 星`}
                            >
                              {(report.rating ?? 0) >= n ? '★' : '☆'}
                            </span>
                          ))}
                        </div>
                        <span className="rp-row-date">
                          {new Date(report.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                        <div className="rp-row-actions" onClick={e => e.stopPropagation()}>
                          <button className="chip-edit-btn" title="编辑"
                            onClick={() => { setModalReport(report); switchToEdit(report); setModalOpen(true); }}>✎</button>
                          <button className="chip-edit-btn" title="删除" style={{ color: 'var(--danger)' }}
                            onClick={e => handleDeleteReport(report, e)}>✕</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

          </div>
        </div>
      </main>

      {/* Full-screen modal */}
      {modalOpen && (
        <div className="rp-modal-overlay" onClick={() => { if (modalMode !== 'edit') closeModal(); }}>
          <div className="rp-modal" onClick={e => e.stopPropagation()}>

            <div className="rp-modal-header">
              {modalMode === 'read' ? (
                <>
                  <div className="rp-modal-header-left">
                    <span className="rp-modal-title-display">{modalReport?.title}</span>
                    <div className="rp-modal-meta">
                      <div className="star-rating-inline" onClick={e => e.stopPropagation()}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <span
                            key={n}
                            className={`star-btn${(modalReport?.rating ?? 0) >= n ? ' filled' : ''}`}
                            onClick={e => modalReport && handleRating(modalReport, n, e)}
                            title={`设为 ${n} 星`}
                          >
                            {(modalReport?.rating ?? 0) >= n ? '★' : '☆'}
                          </span>
                        ))}
                      </div>
                      {modalReport?.source && <span className="research-meta-tag">{modalReport.source}</span>}
                      {modalReport?.reportDate && <span className="research-meta-tag">{modalReport.reportDate}</span>}
                      {modalReport?.category && <span className="research-meta-tag">{modalReport.category}</span>}
                      {modalReport?.createdAt && (
                        <span className="research-meta-date">
                          {new Date(modalReport.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rp-modal-header-right">
                    <button className="icon-btn" onClick={() => modalReport && handleExportPdf(modalReport)} title="导出为 PDF">⬇ 导出PDF</button>
                    <button className="icon-btn" onClick={() => switchToEdit(modalReport!)}>✎ 编辑</button>
                    <button className="icon-btn" onClick={closeModal}>✕ 关闭</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rp-modal-header-left rp-modal-edit-meta">
                    <input
                      className="rp-modal-title-input"
                      placeholder="报告标题 *"
                      value={editTitle}
                      onChange={e => { setEditTitle(e.target.value); if (saveError) setSaveError(''); }}
                      autoFocus
                    />
                    <div className="rp-modal-meta-inputs">
                      <input
                        className="rp-modal-meta-input"
                        placeholder="来源（如：中信证券）"
                        value={editSource}
                        onChange={e => setEditSource(e.target.value)}
                      />
                      <input
                        className="rp-modal-meta-input"
                        placeholder="报告日期（如：2026-04-01）"
                        value={editReportDate}
                        onChange={e => setEditReportDate(e.target.value)}
                      />
                      <input
                        className="rp-modal-meta-input"
                        placeholder="分类（如：宏观 / 科技 / 消费…）"
                        list="rp-category-presets"
                        value={editCategory}
                        onChange={e => setEditCategory(e.target.value)}
                      />
                      <datalist id="rp-category-presets">
                        {reportCategories.filter(c => c !== '全部').map(c => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                  <div className="rp-modal-header-right">
                    {saveError && <span className="doc-save-error">{saveError}</span>}
                    <button className="cancel-btn"
                      onClick={() => { if (modalReport) setModalMode('read'); else closeModal(); }}
                      disabled={savingReport}>取消</button>
                    <button className="confirm-btn" onClick={handleSaveReport}
                      disabled={savingReport}>
                      {savingReport ? '保存中…' : '保存研报'}
                    </button>
                    <button className="icon-btn" onClick={closeModal}>✕</button>
                  </div>
                </>
              )}
            </div>

            <div className="rp-modal-body">
              {modalMode === 'read' ? (
                <div className="rp-modal-read-content doc-read-view" dangerouslySetInnerHTML={{ __html: modalReport?.content || '<p>（无内容）</p>' }} />
              ) : (
                <div className="rp-modal-editor-wrap">
                  <DocEditor
                    ref={docEditorRef}
                    value={editContent}
                    onChange={v => { editContentRef.current = v; setEditContent(v); }}
                  />
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}