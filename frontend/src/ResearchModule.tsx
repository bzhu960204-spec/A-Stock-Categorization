import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ThemePicker } from './ThemePicker';
import { type DocEditorHandle } from './DocEditor';
import CategorySidebar from './CategorySidebar';
import DocRow from './DocRow';
import DocFilterBar from './DocFilterBar';
import DocCategoryPills from './DocCategoryPills';
import DocListToolbar from './DocListToolbar';
import DocEditModal from './DocEditModal';
import DocReadModal from './DocReadModal';
import { printDocument } from './printExport';
import {
  getSectors, createSector, updateSector, deleteSector,
  archiveSector, unarchiveSector,
  getSectorReports, getAllSectorReports, createSectorReport, updateSectorReport, deleteSectorReport,
  updateSectorReportRating, moveSectorReport,
  getArchivedSectorReports, archiveSectorReport, unarchiveSectorReport,
  type Sector, type SectorReport,
} from './api';
import './App.css';

interface ResearchModuleProps {
  onGoHome: () => void;
  forceArchived?: boolean;
}

export default function ResearchModule({ onGoHome, forceArchived }: ResearchModuleProps) {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedSector, setSelectedSector] = useState<Sector | null>(null);
  const [reports, setReports] = useState<SectorReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Archive view
  const [archivedReports, setArchivedReports] = useState<SectorReport[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'read' | 'edit'>('read');
  const [modalReport, setModalReport] = useState<SectorReport | null>(null);

  // Search & filter
  const [search, setSearch] = useState('');
  const [starFilter, setStarFilter] = useState(0); // 0 = all, 1-5 = at least N stars

  // Edit form state (inside modal)
  const [editTitle, setEditTitle] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editReportDate, setEditReportDate] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSectorId, setEditSectorId] = useState<number | null>(null);

  // Drag & drop: move a report onto a sector chip
  const [dragReportId, setDragReportId] = useState<number | null>(null);

  // Category filter for local reports
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const editContentRef = useRef('');
  const [savingReport, setSavingReport] = useState(false);
  const [saveError, setSaveError] = useState('');

  const docEditorRef = useRef<DocEditorHandle>(null);

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

  const loadAllReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const res = await getAllSectorReports();
      setReports(res.data);
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    if (!forceArchived) {
      if (selectedSector) {
        loadReports(selectedSector.id);
      } else {
        loadAllReports();
      }
    }
    setSearch('');
    setStarFilter(0);
    setCategoryFilter('全部');
  }, [selectedSector, loadReports, loadAllReports]);

  const loadArchived = useCallback(async () => {
    setLoadingArchived(true);
    try {
      const res = await getArchivedSectorReports();
      setArchivedReports(res.data);
    } finally {
      setLoadingArchived(false);
    }
  }, []);

  useEffect(() => { if (forceArchived) loadArchived(); }, [forceArchived, loadArchived]);

  const handleArchiveReport = async (report: SectorReport, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await archiveSectorReport(report.sectorId, report.id);
    setReports(prev => prev.filter(r => r.id !== report.id));
    if (modalReport?.id === report.id) closeModal();
  };

  const handleUnarchiveReport = async (report: SectorReport, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await unarchiveSectorReport(report.sectorId, report.id);
    setArchivedReports(prev => prev.filter(r => r.id !== report.id));
    if (modalReport?.id === report.id) closeModal();
    await loadSectors(); // 恢复单篇可能令其行业重新变为活跃
    if (selectedSector?.id === report.sectorId) await loadReports(selectedSector.id);
  };

  const handleDeleteArchivedReport = async (report: SectorReport, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm(`彻底删除研报「${report.title}」？此操作不可恢复。`)) return;
    await deleteSectorReport(report.sectorId, report.id);
    setArchivedReports(prev => prev.filter(r => r.id !== report.id));
  };

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

  const handleAddSector = async (name: string) => {
    if (!name.trim()) return;
    await createSector({ name: name.trim() });
    await loadSectors();
  };

  const handleUpdateSector = async (id: number, name: string) => {
    if (!name.trim()) return;
    await updateSector(id, { name: name.trim() });
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

  const handleArchiveSector = async (sector: Sector) => {
    if (!window.confirm(`归档整个行业「${sector.name}」？该行业及其下所有研报都会被归档隐藏。`)) return;
    await archiveSector(sector.id);
    if (selectedSector?.id === sector.id) setSelectedSector(null);
    await loadSectors();
  };

  const handleUnarchiveSector = async (sector: Sector) => {
    await unarchiveSector(sector.id);
    if (selectedSector?.id === sector.id) setSelectedSector(null);
    await loadSectors();
    await loadArchived();
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
    setEditSectorId(report.sectorId);
    editContentRef.current = report.content || '';
    setSaveError('');
    setModalMode('edit');
  };

  const handleSaveReport = async () => {
    if (!editTitle.trim()) { setSaveError('请填写报告标题'); return; }
    if (!modalReport && !selectedSector) return;
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
        const res = await createSectorReport(selectedSector!.id, payload);
        saved = res.data;
      } else {
        const moved = editSectorId != null && editSectorId !== modalReport.sectorId;
        const res = await updateSectorReport(modalReport.sectorId, modalReport.id, {
          ...payload,
          targetSectorId: moved ? editSectorId : undefined,
        });
        saved = res.data;
      }
      if (selectedSector) await loadReports(selectedSector.id);
      else await loadAllReports();
      setModalReport(saved);
      setModalMode('read');
    } catch {
      setSaveError('保存失败，请重试。');
    } finally {
      setSavingReport(false);
    }
  };

  const handleDropOnSector = async (targetSector: Sector) => {
    const reportId = dragReportId;
    setDragReportId(null);
    if (reportId == null || targetSector.archived) return;
    const report = reports.find(r => r.id === reportId);
    if (!report || report.sectorId === targetSector.id) return;
    try {
      await moveSectorReport(report.sectorId, reportId, targetSector.id);
      if (selectedSector) await loadReports(selectedSector.id);
      else await loadAllReports();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteReport = async (report: SectorReport, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm(`确定删除研报「${report.title}」？`)) return;
    await deleteSectorReport(report.sectorId, report.id);
    setReports(prev => prev.filter(r => r.id !== report.id));
    if (modalReport?.id === report.id) closeModal();
  };

  const handleRating = async (report: SectorReport, n: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newRating = (report.rating ?? 0) === n ? 0 : n;
    try {
      const res = await updateSectorReportRating(report.sectorId, report.id, newRating);
      setReports(prev => prev.map(r => r.id === report.id ? res.data : r));
      if (modalReport?.id === report.id) setModalReport(res.data);
    } catch (err) { console.error(err); }
  };

  const stripHtml = (html: string) =>
    html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);

  const handleExportPdf = (report: SectorReport) => {
    printDocument({
      title: report.title,
      stars: '★'.repeat(report.rating ?? 0) + '☆'.repeat(5 - (report.rating ?? 0)),
      metaParts: [
        report.sectorName ? `行业：${report.sectorName}` : '',
        report.source ? `来源：${report.source}` : '',
        report.reportDate ? `报告日期：${report.reportDate}` : '',
        report.createdAt ? `录入日期：${new Date(report.createdAt).toLocaleDateString('zh-CN')}` : '',
      ],
      contentHtml: report.content,
    });
  };

  // In forced-archive mode: only sectors that actually have archived reports, and filter list by selection.
  const archivedSectorIds = useMemo(() => new Set(archivedReports.map(r => r.sectorId)), [archivedReports]);
  const shownArchivedReports = useMemo(
    () => (forceArchived && selectedSector ? archivedReports.filter(r => r.sectorId === selectedSector.id) : archivedReports),
    [forceArchived, selectedSector, archivedReports],
  );

  return (
    <div className="app-container">
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome} title="返回主页">⌂</button>
          <h1 className="app-title">Sector Research</h1>
        </div>
        <div className="header-right">
          <ThemePicker />
        </div>
      </header>

      <main className="main-layout">
        {/* Sidebar: sectors */}
        <CategorySidebar
          title="行业"
          categories={sectors.filter(s => forceArchived ? (s.archived || archivedSectorIds.has(s.id)) : !s.archived)}
          filter={forceArchived ? (selectedSector?.id ?? -1) : (selectedSector?.id ?? null)}
          onSelect={(id) => {
            if (id === null) { setSelectedSector(null); return; }
            const sector = sectors.find(s => s.id === id) ?? null;
            if (forceArchived) {
              setSelectedSector(prev => prev?.id === id ? null : sector);
            } else {
              setSelectedSector(sector);
            }
          }}
          onAdd={handleAddSector}
          onUpdate={handleUpdateSector}
          onDelete={handleDeleteSector}
          onArchiveFolder={!forceArchived ? handleArchiveSector : undefined}
          onRestoreFolder={forceArchived ? handleUnarchiveSector : undefined}
          onDropItem={!forceArchived ? handleDropOnSector : undefined}
          showAll={!forceArchived}
          fullWidthAll
          canAdd={!forceArchived}
          canEdit={!forceArchived}
          searchable
          searchPlaceholder="过滤行业…"
        />

        {/* Main content */}
        <div className="main-content">
          <div className="rp-list-wrap">

            {forceArchived ? (
              <>
                <DocListToolbar
                  title={selectedSector ? `📥 ${selectedSector.name} · 已归档` : '📥 已归档研报'}
                  count={loadingArchived ? '…' : `${shownArchivedReports.length} 篇`}
                />
                {loadingArchived ? (
                  <div className="research-empty-state">加载中…</div>
                ) : shownArchivedReports.length === 0 ? (
                  <div className="research-empty-state">归档区暂无研报</div>
                ) : (
                  <div className="rp-list">
                    {shownArchivedReports.map(report => (
                      <DocRow
                        key={report.id}
                        onClick={() => openReadModal(report)}
                        tags={<span className="rp-global-sector-tag">{report.sectorName}</span>}
                        title={report.title}
                        preview={report.content ? stripHtml(report.content) : '（无内容）'}
                        rating={report.rating ?? 0}
                        date={new Date(report.createdAt).toLocaleDateString('zh-CN')}
                        actions={
                          <div className="rp-row-actions" onClick={e => e.stopPropagation()}>
                            <button className="chip-edit-btn" title="恢复（取消归档）"
                              onClick={e => handleUnarchiveReport(report, e)}>♻️</button>
                            <button className="chip-edit-btn" title="彻底删除" style={{ color: 'var(--danger)' }}
                              onClick={e => handleDeleteArchivedReport(report, e)}>✕</button>
                          </div>
                        }
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
            <>
            {/* Toolbar */}
            <DocListToolbar
              title={selectedSector?.name ?? '全部研报'}
              count={`${filteredReports.length}/${reports.length} 篇`}
            >
              {selectedSector && (
                <button className="rp-new-btn" onClick={openNewModal}>+ 新增研报</button>
              )}
            </DocListToolbar>

            {/* Unified filter bar */}
            <DocFilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder={selectedSector ? '搜索本行业标题 / 来源 / 日期…' : '搜索全部研报标题 / 来源 / 日期…'}
              starFilter={starFilter}
              onStarFilterChange={setStarFilter}
              showClear={false}
            />

            {/* Category pills */}
            {reportCategories.length > 1 && (
              <DocCategoryPills
                options={reportCategories}
                value={categoryFilter}
                onChange={setCategoryFilter}
              />
            )}

            {/* Results */}
            {loadingReports ? (
              <div className="research-empty-state">加载中…</div>
            ) : reports.length === 0 ? (
              <div className="research-empty-state" style={{ flexDirection: 'column', gap: 14 }}>
                <span style={{ fontSize: '2rem' }}>📋</span>
                <span>{selectedSector ? '暂无研报，点击「新增研报」开始记录' : '暂无研报'}</span>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="research-empty-state">无匹配结果</div>
            ) : (
                <div className="rp-list">
                  {filteredReports.map(report => (
                    <DocRow
                      key={report.id}
                      draggable
                      dragging={dragReportId === report.id}
                      onDragStart={e => { setDragReportId(report.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => setDragReportId(null)}
                      onClick={() => openReadModal(report)}
                      tags={!selectedSector
                        ? <span className="rp-global-sector-tag">{report.sectorName}</span>
                        : (report.category ? <span className="rp-global-sector-tag">{report.category}</span> : undefined)}
                      title={report.title}
                      preview={report.content ? stripHtml(report.content) : '（无内容）'}
                      rating={report.rating ?? 0}
                      onRate={n => handleRating(report, n)}
                      date={new Date(report.createdAt).toLocaleDateString('zh-CN')}
                      actions={
                        <div className="rp-row-actions" onClick={e => e.stopPropagation()}>
                          <button className="chip-edit-btn" title="编辑"
                            onClick={() => { setModalReport(report); switchToEdit(report); setModalOpen(true); }}>✎</button>
                          <button className="chip-edit-btn" title="归档"
                            onClick={e => handleArchiveReport(report, e)}>📥</button>
                          <button className="chip-edit-btn" title="删除" style={{ color: 'var(--danger)' }}
                            onClick={e => handleDeleteReport(report, e)}>✕</button>
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
            </>
            )}

          </div>
        </div>
      </main>

      {/* Read view — shared component (also used by the archive center) */}
      {modalOpen && modalMode === 'read' && modalReport && (
        <DocReadModal
          title={modalReport.title}
          rating={modalReport.rating}
          onRate={n => handleRating(modalReport, n)}
          metaTags={<>
            {modalReport.sectorName && <span className="research-meta-tag">{modalReport.sectorName}</span>}
            {modalReport.source && <span className="research-meta-tag">{modalReport.source}</span>}
            {modalReport.reportDate && <span className="research-meta-tag">{modalReport.reportDate}</span>}
            {modalReport.category && <span className="research-meta-tag">{modalReport.category}</span>}
            {modalReport.createdAt && (
              <span className="research-meta-date">{new Date(modalReport.createdAt).toLocaleDateString('zh-CN')}</span>
            )}
          </>}
          content={modalReport.content}
          onExportPdf={() => handleExportPdf(modalReport)}
          onEdit={() => switchToEdit(modalReport)}
          onClose={closeModal}
          headerExtra={
            modalReport.archived ? (
              <button className="icon-btn" onClick={() => handleUnarchiveReport(modalReport)} title="恢复">♻️ 恢复</button>
            ) : (
              <button className="icon-btn" onClick={() => handleArchiveReport(modalReport)} title="归档">📥 归档</button>
            )
          }
        />
      )}

      {/* Edit view */}
      {modalOpen && modalMode === 'edit' && (
        <DocEditModal
          titleValue={editTitle}
          onTitleChange={v => { setEditTitle(v); if (saveError) setSaveError(''); }}
          titlePlaceholder="报告标题 *"
          metaFields={<>
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
            <select
              className="rp-modal-meta-input"
              value={editSectorId ?? ''}
              onChange={e => setEditSectorId(Number(e.target.value))}
              title="所属行业"
            >
              {sectors
                .filter(s => !s.archived || s.id === editSectorId)
                .map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
            </select>
          </>}
          content={editContent}
          onContentChange={v => { editContentRef.current = v; setEditContent(v); }}
          editorRef={docEditorRef}
          saveLabel="保存研报"
          saving={savingReport}
          saveError={saveError}
          onSave={handleSaveReport}
          onCancel={() => { if (modalReport) setModalMode('read'); else closeModal(); }}
          onClose={closeModal}
        />
      )}
    </div>
  );
}