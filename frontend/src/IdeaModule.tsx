import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ThemePicker } from './ThemePicker';
import { type DocEditorHandle } from './DocEditor';
import CategorySidebar from './CategorySidebar';
import DocRow from './DocRow';
import DocFilterBar from './DocFilterBar';
import DocCategoryPills from './DocCategoryPills';
import DocListToolbar from './DocListToolbar';
import DocEditModal from './DocEditModal';
import { IdeaReadModal } from './IdeaReadModal';
import {
  getIdeaCategories, createIdeaCategory, updateIdeaCategory, deleteIdeaCategory,
  archiveIdeaCategory, unarchiveIdeaCategory,
  getIdeas, searchIdeas, createIdea, updateIdea, updateIdeaRating, deleteIdea,
  getArchivedIdeas, archiveIdea, unarchiveIdea,
  getIdeaAttachments, uploadIdeaAttachment, deleteIdeaAttachment, getIdeaAttachmentDownloadUrl,
  getIdeaComments, createIdeaComment, updateIdeaComment, deleteIdeaComment,
  type IdeaCategory, type Idea, type IdeaAttachment, type IdeaComment,
} from './api';
import './App.css';

interface IdeaModuleProps {
  onGoHome: () => void;
  forceArchived?: boolean;
}

export default function IdeaModule({ onGoHome, forceArchived }: IdeaModuleProps) {
  const [categories, setCategories] = useState<IdeaCategory[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);

  // Archive view
  const [archivedIdeas, setArchivedIdeas] = useState<Idea[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);

  // Sidebar filter: null = all, number = category id
  const [filter, setFilter] = useState<null | number>(null);

  // Star filter: 0 = all, 1-5 = at least N stars
  const [starFilter, setStarFilter] = useState(0);

  // Search
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Idea[]>([]);
  const [searching, setSearching] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'read' | 'edit'>('read');
  const [modalIdea, setModalIdea] = useState<Idea | null>(null);

  // Edit form
  const [editTitle, setEditTitle] = useState('');
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editSubCategory, setEditSubCategory] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editRating, setEditRating] = useState(0);

  // Sub-category filter (within selected folder)
  const [subCategoryFilter, setSubCategoryFilter] = useState('全部');
  const editContentRef = useRef('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Drag & drop: move an idea card onto a category chip
  const [dragIdeaId, setDragIdeaId] = useState<number | null>(null);

  const docEditorRef = useRef<DocEditorHandle>(null);

  // Attachments
  const [attachments, setAttachments] = useState<IdeaAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);

  // Comments
  const [comments, setComments] = useState<IdeaComment[]>([]);


  // ── ESC closes modal (blocked in edit mode to prevent data loss) ──────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalOpen && modalMode !== 'edit') closeModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalOpen, modalMode]);

  // ── Load categories ───────────────────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    const res = await getIdeaCategories();
    setCategories(res.data);
  }, []);
  useEffect(() => { loadCategories(); }, [loadCategories]);

  // ── Load ideas ────────────────────────────────────────────────────────────
  const loadIdeas = useCallback(async () => {
    setLoading(true);
    setSubCategoryFilter('全部'); // reset sub-filter when folder changes
    try {
      const res = typeof filter === 'number'
        ? await getIdeas({ categoryId: filter })
        : await getIdeas();
      setIdeas(res.data);
    } finally {
      setLoading(false);
    }
  }, [filter]);
  useEffect(() => { loadIdeas(); }, [loadIdeas]);

  // ── Debounced global search ───────────────────────────────────────────────
  useEffect(() => {
    const kw = search.trim();
    if (!kw) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchIdeas(kw);
        setSearchResults(res.data);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Displayed list (star filter applied client-side) ────────────────────
  const ideaSubCategories = useMemo(() =>
    ['全部', ...Array.from(new Set(ideas.map(i => i.subCategory).filter((c): c is string => !!c)))],
    [ideas]
  );

  const displayIdeas = useMemo(() => {
    let list = search.trim() ? searchResults : ideas;
    if (subCategoryFilter !== '全部') list = list.filter(i => (i.subCategory || '') === subCategoryFilter);
    if (starFilter > 0) list = list.filter(i => i.rating >= starFilter);
    return list;
  }, [ideas, search, searchResults, starFilter, subCategoryFilter]);

  // ── Category CRUD ─────────────────────────────────────────────────────────
  const handleAddCat = async (name: string) => {
    await createIdeaCategory({ name });
    await loadCategories();
  };

  const handleUpdateCat = async (id: number, name: string) => {
    await updateIdeaCategory(id, { name });
    await loadCategories();
  };

  const handleDeleteCat = async (cat: IdeaCategory) => {
    if (!window.confirm(`确定删除分类「${cat.name}」？该分类下有 Idea 时无法删除。`)) return;
    try {
      await deleteIdeaCategory(cat.id);
      if (filter === cat.id) setFilter(null);
      await loadCategories();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        alert(`无法删除「${cat.name}」，请先移除该分类下的所有 Idea。`);
      } else {
        alert('删除失败，请重试。');
      }
    }
  };

  // ── Modal ─────────────────────────────────────────────────────────────────
  const closeModal = () => {
    setModalOpen(false);
    setModalIdea(null);
    setSaveError('');
  };

  const openReadModal = (idea: Idea) => {
    setModalIdea(idea);
    setModalMode('read');
    setModalOpen(true);
    setAttachments([]);
    setComments([]);
    getIdeaAttachments(idea.id).then(res => setAttachments(res.data)).catch(() => {});
    getIdeaComments(idea.id).then(res => setComments(res.data)).catch(() => {});
  };

  const openNewModal = () => {
    setModalIdea(null);
    setEditTitle('');
    setEditCategoryName(
      typeof filter === 'number' ? (categories.find(c => c.id === filter)?.name ?? '') : ''
    );
    setEditSubCategory(subCategoryFilter !== '全部' ? subCategoryFilter : '');
    setEditContent('');
    editContentRef.current = '';
    setEditRating(0);
    setSaveError('');
    setAttachments([]);
    setModalMode('edit');
    setModalOpen(true);
  };

  const switchToEdit = (idea: Idea) => {
    setEditTitle(idea.title);
    setEditCategoryName(idea.categoryName ?? '');
    setEditSubCategory(idea.subCategory ?? '');
    setEditContent(idea.content || '');
    editContentRef.current = idea.content || '';
    setEditRating(idea.rating ?? 0);
    setSaveError('');
    setModalMode('edit');
  };

  const handleSave = async () => {
    if (!editTitle.trim()) { setSaveError('请填写 Idea 标题'); return; }
    setSaving(true);
    setSaveError('');
    try {
      // Resolve free-text category → IdeaCategory id (find or auto-create)
      let categoryId: number | null = null;
      const catName = editCategoryName.trim();
      if (catName) {
        const existing = categories.find(c => c.name === catName);
        if (existing) {
          categoryId = existing.id;
        } else {
          const res = await createIdeaCategory({ name: catName });
          categoryId = res.data.id;
          await loadCategories(); // refresh sidebar
        }
      }
      const payload = {
        title: editTitle.trim(),
        content: editContentRef.current,
        categoryId,
        subCategory: editSubCategory.trim() || undefined,
        rating: editRating,
      };
      let saved: Idea;
      if (!modalIdea) {
        const res = await createIdea(payload);
        saved = res.data;
      } else {
        const res = await updateIdea(modalIdea.id, payload);
        saved = res.data;
      }
      await loadIdeas();
      setModalIdea(saved);
      setModalMode('read');
    } catch {
      setSaveError('保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (idea: Idea, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm(`确定删除「${idea.title}」？`)) return;
    await deleteIdea(idea.id);
    await loadIdeas();
    if (modalIdea?.id === idea.id) closeModal();
  };

  const loadArchived = useCallback(async () => {
    setLoadingArchived(true);
    try {
      const res = await getArchivedIdeas();
      setArchivedIdeas(res.data);
    } finally {
      setLoadingArchived(false);
    }
  }, []);

  useEffect(() => { if (forceArchived) loadArchived(); }, [forceArchived, loadArchived]);

  const handleArchiveIdea = async (idea: Idea, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await archiveIdea(idea.id);
    setIdeas(prev => prev.filter(i => i.id !== idea.id));
    if (modalIdea?.id === idea.id) closeModal();
  };

  const handleUnarchiveIdea = async (idea: Idea, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await unarchiveIdea(idea.id);
    setArchivedIdeas(prev => prev.filter(i => i.id !== idea.id));
    if (modalIdea?.id === idea.id) closeModal();
    await loadCategories(); // 恢复单篇可能令其文件夹重新变为活跃
    await loadIdeas();
  };

  const handleArchiveFolder = async (cat: IdeaCategory) => {
    if (!window.confirm(`归档整个文件夹「${cat.name}」？该文件夹及其下所有 Idea 都会被归档隐藏。`)) return;
    await archiveIdeaCategory(cat.id);
    if (filter === cat.id) setFilter(null);
    await loadCategories();
    await loadIdeas();
  };

  const handleUnarchiveFolder = async (cat: IdeaCategory) => {
    await unarchiveIdeaCategory(cat.id);
    if (filter === cat.id) setFilter(null);
    await loadCategories();
    await loadArchived();
    if (!forceArchived) await loadIdeas();
  };

  const handleDeleteArchivedIdea = async (idea: Idea, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm(`彻底删除「${idea.title}」？此操作不可恢复。`)) return;
    await deleteIdea(idea.id);
    setArchivedIdeas(prev => prev.filter(i => i.id !== idea.id));
    if (modalIdea?.id === idea.id) closeModal();
  };

  const handleRating = async (idea: Idea, n: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newRating = idea.rating === n ? 0 : n; // click same star → clear
    try {
      const res = await updateIdeaRating(idea.id, newRating);
      setIdeas(prev => prev.map(i => i.id === idea.id ? res.data : i));
      if (modalIdea?.id === idea.id) setModalIdea(res.data);
    } catch (err) { console.error(err); }
  };

  const stripHtml = (html: string) =>
    html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

  // In forced-archive mode: only categories that have archived ideas, and filter list by selection.
  const archivedCategoryIds = useMemo(() => new Set(archivedIdeas.map(i => i.categoryId)), [archivedIdeas]);
  const archivedCategories = useMemo(
    () => (forceArchived
      ? categories.filter(c => c.archived || archivedCategoryIds.has(c.id))
      : categories.filter(c => !c.archived)),
    [forceArchived, categories, archivedCategoryIds],
  );
  const shownArchivedIdeas = useMemo(
    () => (forceArchived && filter !== null ? archivedIdeas.filter(i => i.categoryId === filter) : archivedIdeas),
    [forceArchived, filter, archivedIdeas],
  );

  const filterLabel = () => {
    if (filter === null) return '全部 Idea';
    const cat = categories.find(c => c.id === filter);
    return cat ? cat.name : '全部 Idea';
  };

  // ── Drag an idea card onto a folder chip to move it there ──────────────────
  const handleMoveToCategory = async (cat: IdeaCategory) => {
    const id = dragIdeaId;
    setDragIdeaId(null);
    if (id == null) return;
    const idea = ideas.find(i => i.id === id);
    if (!idea || idea.categoryId === cat.id) return;
    await updateIdea(idea.id, {
      title: idea.title,
      content: idea.content,
      categoryId: cat.id,
      subCategory: idea.subCategory,
      rating: idea.rating,
    });
    await loadIdeas();
  };

  // ── Attachment handlers ────────────────────────────────────────────────────
  const doUploadFile = async (file: File) => {
    if (!modalIdea) return;
    setUploadingAttachment(true);
    try {
      const att = await uploadIdeaAttachment(modalIdea.id, file);
      setAttachments(prev => [att, ...prev]);
    } catch {
      alert('附件上传失败，请重试。');
    } finally {
      setUploadingAttachment(false);
      if (attachInputRef.current) attachInputRef.current.value = '';
    }
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await doUploadFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await doUploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleAttachmentDelete = async (att: IdeaAttachment) => {
    if (!window.confirm(`确定删除附件「${att.fileName}」？`)) return;
    try {
      await deleteIdeaAttachment(att.ideaId, att.id);
      setAttachments(prev => prev.filter(a => a.id !== att.id));
    } catch {
      alert('删除附件失败。');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome} title="返回主页">⌂</button>
          <h1 className="app-title">Idea Vault</h1>
        </div>
        <div className="header-right">
          <ThemePicker />
        </div>
      </header>

      <main className="main-layout">
        {/* ── Sidebar ── */}
        <CategorySidebar
          categories={archivedCategories}
          filter={filter}
          onSelect={(id) => {
            setFilter(id);
            setSearch('');
          }}
          onAdd={handleAddCat}
          onUpdate={handleUpdateCat}
          onDelete={handleDeleteCat}
          onArchiveFolder={!forceArchived ? handleArchiveFolder : undefined}
          onRestoreFolder={forceArchived ? handleUnarchiveFolder : undefined}
          onDropItem={!forceArchived ? handleMoveToCategory : undefined}
        />

        {/* ── Main ── */}
        <div className="main-content">
          <div className="rp-list-wrap">

            {/* Toolbar */}
            <DocListToolbar
              title={forceArchived ? (filter !== null ? `📥 ${filterLabel()} · 已归档` : '📥 已归档 Idea') : filterLabel()}
              count={forceArchived
                ? (loadingArchived ? '…' : `${shownArchivedIdeas.length} 条`)
                : (search.trim()
                  ? (searching ? '…' : `${displayIdeas.length} 条`)
                  : `${displayIdeas.length}/${ideas.length} 条`)}
            >
              {!forceArchived && (
                <button className="rp-new-btn" onClick={openNewModal}>+ 新增 Idea</button>
              )}
            </DocListToolbar>

            {forceArchived ? (
              loadingArchived ? (
                <div className="research-empty-state">加载中…</div>
              ) : shownArchivedIdeas.length === 0 ? (
                <div className="research-empty-state">归档区暂无 Idea</div>
              ) : (
                <div className="rp-list">
                  {shownArchivedIdeas.map(idea => (
                    <DocRow
                      key={idea.id}
                      onClick={() => openReadModal(idea)}
                      tags={<>
                        {idea.categoryName && (
                          <span className="rp-global-sector-tag">{idea.categoryName}</span>
                        )}
                        {idea.subCategory && (
                          <span className="doc-category-pill active" style={{ fontSize: '0.68rem', padding: '1px 8px' }}>{idea.subCategory}</span>
                        )}
                      </>}
                      title={idea.title}
                      preview={idea.content ? stripHtml(idea.content) : ''}
                      rating={idea.rating}
                      date={new Date(idea.createdAt).toLocaleDateString('zh-CN')}
                      actions={<>
                        <button className="chip-edit-btn" title="恢复（取消归档）" style={{ marginLeft: 4 }}
                          onClick={e => handleUnarchiveIdea(idea, e)}>♻️</button>
                        <button className="chip-edit-btn" style={{ color: 'var(--danger)' }} title="彻底删除"
                          onClick={e => handleDeleteArchivedIdea(idea, e)}>✕</button>
                      </>}
                    />
                  ))}
                </div>
              )
            ) : (
            <>
            {/* Search + star filter bar */}
            <DocFilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="全局搜索 Idea 标题 / 内容…"
              starFilter={starFilter}
              onStarFilterChange={setStarFilter}
            />

            {/* Sub-category pills — shown when folder is selected and sub-categories exist */}
            {!search.trim() && ideaSubCategories.length > 1 && (
              <DocCategoryPills
                options={ideaSubCategories}
                value={subCategoryFilter}
                onChange={setSubCategoryFilter}
              />
            )}

            {/* List */}
            {loading && !search.trim() ? (
              <div className="research-empty-state">加载中…</div>
            ) : searching ? (
              <div className="research-empty-state">搜索中…</div>
            ) : displayIdeas.length === 0 ? (
              <div className="research-empty-state">
                {search.trim() ? '无匹配 Idea' : '点击「+ 新增 Idea」开始记录'}
              </div>
            ) : (
              <div className="rp-list">
                {displayIdeas.map(idea => (
                  <DocRow
                    key={idea.id}
                    draggable
                    dragging={dragIdeaId === idea.id}
                    onDragStart={e => { setDragIdeaId(idea.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDragIdeaId(null)}
                    onClick={() => openReadModal(idea)}
                    tags={<>
                      {idea.categoryName && (
                        <span className="rp-global-sector-tag">{idea.categoryName}</span>
                      )}
                      {idea.subCategory && (
                        <span className="doc-category-pill active" style={{ fontSize: '0.68rem', padding: '1px 8px' }}>{idea.subCategory}</span>
                      )}
                    </>}
                    title={idea.title}
                    preview={idea.content ? stripHtml(idea.content) : ''}
                    rating={idea.rating}
                    onRate={n => handleRating(idea, n)}
                    date={new Date(idea.createdAt).toLocaleDateString('zh-CN')}
                    actions={<>
                      <button
                        className="chip-edit-btn"
                        style={{ marginLeft: 4 }}
                        title="归档"
                        onClick={e => handleArchiveIdea(idea, e)}
                      >📥</button>
                      <button
                        className="chip-edit-btn"
                        style={{ color: 'var(--danger)', marginLeft: 4 }}
                        title="删除"
                        onClick={e => handleDelete(idea, e)}
                      >✕</button>
                    </>}
                  />
                ))}
              </div>
            )}
            </>
            )}
          </div>
        </div>
      </main>

      {/* ── Modal ── */}
      {/* Read view — shared component (also used by the archive center) */}
      {modalOpen && modalMode === 'read' && modalIdea && (
        <IdeaReadModal
          idea={modalIdea}
          attachments={attachments}
          comments={comments}
          onClose={closeModal}
          onRate={(n) => handleRating(modalIdea, n)}
          onEdit={() => switchToEdit(modalIdea)}
          headerExtra={
            modalIdea.archived ? (
              <button className="icon-btn" onClick={() => handleUnarchiveIdea(modalIdea)} title="恢复">♻️ 恢复</button>
            ) : (
              <button className="icon-btn" onClick={() => handleArchiveIdea(modalIdea)} title="归档">📥 归档</button>
            )
          }
          onAddComment={async (content) => {
            const res = await createIdeaComment(modalIdea.id, content);
            setComments(prev => [...prev, res.data]);
          }}
          onUpdateComment={async (id, content) => {
            const res = await updateIdeaComment(modalIdea.id, id, content);
            setComments(prev => prev.map(c => c.id === id ? res.data : c));
          }}
          onDeleteComment={async (id) => {
            if (!window.confirm('确定删除该评论？')) return;
            await deleteIdeaComment(modalIdea.id, id);
            setComments(prev => prev.filter(c => c.id !== id));
          }}
        />
      )}

      {/* Edit view */}
      {modalOpen && modalMode === 'edit' && (
        <DocEditModal
          titleValue={editTitle}
          onTitleChange={v => { setEditTitle(v); if (saveError) setSaveError(''); }}
          titlePlaceholder="Idea 标题 *"
          metaFields={<>
            <input
              className="rp-modal-meta-input"
              placeholder="文件夹分类（可直接输入新分类名）"
              list="idea-category-list"
              value={editCategoryName}
              onChange={e => setEditCategoryName(e.target.value)}
            />
            <datalist id="idea-category-list">
              {categories.map(cat => (
                <option key={cat.id} value={cat.name} />
              ))}
            </datalist>
            <input
              className="rp-modal-meta-input"
              placeholder="子分类（如：策略 / 交易 / 观察…）"
              list="idea-subcategory-list"
              value={editSubCategory}
              onChange={e => setEditSubCategory(e.target.value)}
            />
            <datalist id="idea-subcategory-list">
              {ideaSubCategories.filter(c => c !== '全部').map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>}
          rating={editRating}
          onRatingChange={setEditRating}
          content={editContent}
          onContentChange={v => { editContentRef.current = v; setEditContent(v); }}
          editorRef={docEditorRef}
          saveLabel="保存 Idea"
          saving={saving}
          saveError={saveError}
          onSave={handleSave}
          onCancel={() => { if (modalIdea) setModalMode('read'); else closeModal(); }}
          onClose={closeModal}
          onDelete={modalIdea ? () => handleDelete(modalIdea) : undefined}
          bodyExtra={!!modalIdea && (
            <div
              className={`idea-attachments-section${dragOver ? ' drag-over' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="idea-attachments-header">
                <span className="idea-attachments-title">📎 附件{attachments.length > 0 ? ` (${attachments.length})` : ''}</span>
                <button
                  className="idea-attach-upload-btn"
                  onClick={() => attachInputRef.current?.click()}
                  disabled={uploadingAttachment}
                >
                  {uploadingAttachment ? '⏳ 上传中…' : '＋ 上传附件'}
                </button>
                <input
                  ref={attachInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={handleAttachmentUpload}
                />
              </div>
              {attachments.length > 0 && (
                <div className="idea-attachments-list">
                  {attachments.map(att => (
                    <div key={att.id} className="idea-attachment-item">
                      <a
                        href={getIdeaAttachmentDownloadUrl(att.ideaId, att.id)}
                        className="idea-attachment-link"
                        download={att.fileName}
                        title={`下载 ${att.fileName}`}
                      >
                        <span className="idea-attachment-icon">📄</span>
                        <span className="idea-attachment-name">{att.fileName}</span>
                        <span className="idea-attachment-size">{formatFileSize(att.fileSize)}</span>
                      </a>
                      <button
                        className="chip-edit-btn"
                        style={{ color: 'var(--danger)' }}
                        title="删除附件"
                        onClick={() => handleAttachmentDelete(att)}
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
              {attachments.length === 0 && (
                <div className="idea-attachments-empty">将文件拖拽到此处，或点击上方按钮上传</div>
              )}
            </div>
          )}
        />
      )}
    </div>
  );
}
