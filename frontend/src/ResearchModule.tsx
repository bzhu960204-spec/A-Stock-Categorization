import { useState, useEffect, useCallback, useRef } from 'react';
import { DocEditor, type DocEditorHandle } from './DocEditor';
import {
  getSectors, createSector, updateSector, deleteSector,
  getSectorReports, createSectorReport, updateSectorReport, deleteSectorReport,
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

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'read' | 'edit'>('read');
  const [modalReport, setModalReport] = useState<SectorReport | null>(null);

  // Edit form state (inside modal)
  const [editTitle, setEditTitle] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editReportDate, setEditReportDate] = useState('');
  const [editContent, setEditContent] = useState('');
  const editContentRef = useRef('');
  const [savingReport, setSavingReport] = useState(false);
  const [saveError, setSaveError] = useState('');

  const docEditorRef = useRef<DocEditorHandle>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && modalOpen) closeModal(); };
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
    if (selectedSector) loadReports(selectedSector.id);
    else setReports([]);
  }, [selectedSector, loadReports]);

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
    setEditContent(report.content || '');
    editContentRef.current = report.content || '';
    setSaveError('');
    setModalMode('edit');
  };

  const handleSaveReport = async () => {
    if (!selectedSector || !editTitle.trim()) return;
    setSavingReport(true);
    setSaveError('');
    try {
      const payload = {
        title: editTitle.trim(),
        content: editContentRef.current,
        source: editSource.trim() || undefined,
        reportDate: editReportDate.trim() || undefined,
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

  const stripHtml = (html: string) =>
    html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);

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

            <div className="category-list">
              {sectors.map(sector => (
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

        {/* Main content: full-width report list */}
        <div className="main-content">
          {!selectedSector ? (
            <div className="research-empty-state">
              <span>← 从左侧选择一个行业</span>
            </div>
          ) : (
            <div className="rp-list-wrap">
              <div className="rp-toolbar">
                <span className="rp-toolbar-title">{selectedSector.name}</span>
                <span className="rp-toolbar-count">{reports.length} 篇</span>
                <div style={{ flex: 1 }} />
                <button className="rp-new-btn" onClick={openNewModal}>+ 新增研报</button>
              </div>

              {loadingReports ? (
                <div className="research-empty-state">加载中…</div>
              ) : reports.length === 0 ? (
                <div className="research-empty-state" style={{ flexDirection: 'column', gap: 14 }}>
                  <span style={{ fontSize: '2rem' }}>📋</span>
                  <span>暂无研报，点击「新增研报」开始记录</span>
                </div>
              ) : (
                <div className="rp-list">
                  {reports.map(report => (
                    <div key={report.id} className="rp-row" onClick={() => openReadModal(report)}>
                      <div className="rp-row-main">
                        <span className="rp-row-title">{report.title}</span>
                        <span className="rp-row-preview">
                          {report.content ? stripHtml(report.content) : '（无内容）'}
                        </span>
                      </div>
                      <div className="rp-row-right">
                        <div className="rp-row-tags">
                          {report.source && <span className="research-meta-tag">{report.source}</span>}
                          {report.reportDate && <span className="research-meta-tag">{report.reportDate}</span>}
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
              )}
            </div>
          )}
        </div>
      </main>

      {/* Full-screen modal */}
      {modalOpen && (
        <div className="rp-modal-overlay" onClick={closeModal}>
          <div className="rp-modal" onClick={e => e.stopPropagation()}>

            <div className="rp-modal-header">
              {modalMode === 'read' ? (
                <>
                  <div className="rp-modal-header-left">
                    <span className="rp-modal-title-display">{modalReport?.title}</span>
                    <div className="rp-modal-meta">
                      {modalReport?.source && <span className="research-meta-tag">{modalReport.source}</span>}
                      {modalReport?.reportDate && <span className="research-meta-tag">{modalReport.reportDate}</span>}
                      {modalReport?.createdAt && (
                        <span className="research-meta-date">
                          {new Date(modalReport.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rp-modal-header-right">
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
                      onChange={e => setEditTitle(e.target.value)}
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
                    </div>
                  </div>
                  <div className="rp-modal-header-right">
                    {saveError && <span className="doc-save-error">{saveError}</span>}
                    <button className="cancel-btn"
                      onClick={() => { if (modalReport) setModalMode('read'); else closeModal(); }}
                      disabled={savingReport}>取消</button>
                    <button className="confirm-btn" onClick={handleSaveReport}
                      disabled={savingReport || !editTitle.trim()}>
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