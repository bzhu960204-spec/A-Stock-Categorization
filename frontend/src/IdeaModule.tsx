import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useDarkMode } from './useDarkMode';
import { DocEditor, type DocEditorHandle } from './DocEditor';
import CategorySidebar from './CategorySidebar';
import {
  getIdeaCategories, createIdeaCategory, updateIdeaCategory, deleteIdeaCategory,
  getIdeas, searchIdeas, createIdea, updateIdea, updateIdeaRating, deleteIdea,
  getIdeaAttachments, uploadIdeaAttachment, deleteIdeaAttachment, getIdeaAttachmentDownloadUrl,
  getIdeaComments, createIdeaComment, updateIdeaComment, deleteIdeaComment,
  type IdeaCategory, type Idea, type IdeaAttachment, type IdeaComment,
} from './api';
import './App.css';

interface IdeaModuleProps {
  onGoHome: () => void;
}

export default function IdeaModule({ onGoHome }: IdeaModuleProps) {
  const [darkMode, setDarkMode] = useDarkMode();
  const [categories, setCategories] = useState<IdeaCategory[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);

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

  const docEditorRef = useRef<DocEditorHandle>(null);

  // Attachments
  const [attachments, setAttachments] = useState<IdeaAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);

  // Comments
  const [comments, setComments] = useState<IdeaComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');


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
    setNewComment('');
    setEditingCommentId(null);
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

  const handleRating = async (idea: Idea, n: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newRating = idea.rating === n ? 0 : n; // click same star → clear
    try {
      const res = await updateIdeaRating(idea.id, newRating);
      setIdeas(prev => prev.map(i => i.id === idea.id ? res.data : i));
      if (modalIdea?.id === idea.id) setModalIdea(res.data);
    } catch (err) { console.error(err); }
  };

  const stripHtml = (html: string) =>
    html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

  const filterLabel = () => {
    if (filter === null) return '全部 Idea';
    const cat = categories.find(c => c.id === filter);
    return cat ? cat.name : '全部 Idea';
  };

  // ── Export PDF ─────────────────────────────────────────────────────────────
  const handleExportPdf = (idea: Idea) => {
    const stars = '★'.repeat(idea.rating) + '☆'.repeat(5 - idea.rating);
    const metaParts = [
      idea.categoryName ? `分类：${idea.categoryName}` : '',
      idea.rating > 0 ? `评星：${stars}` : '',
      idea.createdAt ? `录入日期：${new Date(idea.createdAt).toLocaleDateString('zh-CN')}` : '',
    ].filter(Boolean).join('　|　');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${idea.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "PingFang SC","Microsoft YaHei","SimSun",sans-serif; font-size: 14px; color: #1a1a1a; background: #fff; padding: 40px 48px; }
    .idea-title { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
    .idea-meta { font-size: 12px; color: #666; border-bottom: 1px solid #e0e0e0; padding-bottom: 10px; margin-bottom: 24px; }
    .idea-content { line-height: 1.8; }
    .idea-content p { margin-bottom: .8em; }
    .idea-content h1,.idea-content h2,.idea-content h3 { margin: 1em 0 .5em; font-weight: 600; }
    .idea-content ul,.idea-content ol { margin: .5em 0 .8em 1.5em; }
    .idea-content li { margin-bottom: .3em; }
    .idea-content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    .idea-content th,.idea-content td { border: 1px solid #ccc; padding: 6px 10px; font-size: 13px; }
    .idea-content th { background: #f5f5f5; font-weight: 600; }
    .idea-content blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #555; margin: .8em 0; }
    @media print { @page { size: A4; margin: 20mm 18mm; } }
  </style>
</head>
<body>
  <div class="idea-title">${idea.title}</div>
  <div class="idea-meta">${metaParts}</div>
  <div class="idea-content">${idea.content || '<p>（无内容）</p>'}</div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };<\/script>
</body>
</html>`;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(html); win.document.close(); }
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

  // ── Comment handlers ───────────────────────────────────────────────────────
  const handleAddComment = async () => {
    if (!modalIdea || !newComment.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await createIdeaComment(modalIdea.id, newComment.trim());
      setComments(prev => [...prev, res.data]);
      setNewComment('');
    } catch {
      alert('评论发送失败，请重试。');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleUpdateComment = async (commentId: number) => {
    if (!modalIdea || !editingCommentContent.trim()) return;
    try {
      const res = await updateIdeaComment(modalIdea.id, commentId, editingCommentContent.trim());
      setComments(prev => prev.map(c => c.id === commentId ? res.data : c));
      setEditingCommentId(null);
      setEditingCommentContent('');
    } catch {
      alert('评论更新失败。');
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!modalIdea || !window.confirm('确定删除该评论？')) return;
    try {
      await deleteIdeaComment(modalIdea.id, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch {
      alert('评论删除失败。');
    }
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
          <button className="icon-btn" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? 'LITE' : 'TERM'}
          </button>
        </div>
      </header>

      <main className="main-layout">
        {/* ── Sidebar ── */}
        <CategorySidebar
          categories={categories}
          filter={filter}
          onSelect={(id) => { setFilter(id); setSearch(''); }}
          onAdd={handleAddCat}
          onUpdate={handleUpdateCat}
          onDelete={handleDeleteCat}
        />

        {/* ── Main ── */}
        <div className="main-content">
          <div className="rp-list-wrap">

            {/* Toolbar */}
            <div className="rp-toolbar">
              <span className="rp-toolbar-title">{filterLabel()}</span>
              <span className="rp-toolbar-count">
                {search.trim()
                  ? (searching ? '…' : `${displayIdeas.length} 条`)
                  : `${displayIdeas.length}/${ideas.length} 条`}
              </span>
              <div style={{ flex: 1 }} />
              <button className="rp-new-btn" onClick={openNewModal}>+ 新增 Idea</button>
            </div>

            {/* Search + star filter bar */}
            <div className="rp-filter-bar">
              <div className="rp-search-wrap">
                <input
                  className="rp-search-input"
                  placeholder="全局搜索 Idea 标题 / 内容…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="rp-scope-toggle"
                    onClick={() => setSearch('')}
                    title="清空搜索"
                  >✕</button>
                )}
              </div>
              <div className="rp-star-filters">
                {[0, 1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    className={`rp-star-filter-btn${starFilter === n ? ' active' : ''}`}
                    onClick={() => setStarFilter(n)}
                    title={n === 0 ? '全部' : `${n}星及以上`}
                  >
                    {n === 0 ? '全部' : '★'.repeat(n)}
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-category pills — shown when folder is selected and sub-categories exist */}
            {!search.trim() && ideaSubCategories.length > 1 && (
              <div className="doc-category-pills">
                {ideaSubCategories.map(cat => (
                  <button
                    key={cat}
                    className={`doc-category-pill${subCategoryFilter === cat ? ' active' : ''}`}
                    onClick={() => setSubCategoryFilter(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
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
                  <div key={idea.id} className="rp-row" onClick={() => openReadModal(idea)}>
                    <div className="rp-row-main">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {idea.categoryName && (
                          <span className="rp-global-sector-tag">{idea.categoryName}</span>
                        )}                          {idea.subCategory && (
                            <span className="doc-category-pill active" style={{ fontSize: '0.68rem', padding: '1px 8px' }}>{idea.subCategory}</span>
                          )}                        <span className="rp-row-title">{idea.title}</span>
                      </div>
                      {idea.content && (
                        <span className="rp-row-preview">{stripHtml(idea.content)}</span>
                      )}
                    </div>
                    <div className="rp-row-right">
                      <div className="rp-row-stars" onClick={e => e.stopPropagation()}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <span
                            key={n}
                            className={`star-btn${idea.rating >= n ? ' filled' : ''}`}
                            onClick={e => handleRating(idea, n, e)}
                            title={`评为 ${n} 星`}
                          >
                            {idea.rating >= n ? '★' : '☆'}
                          </span>
                        ))}
                      </div>
                      <span className="rp-row-date">
                        {new Date(idea.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                      <button
                        className="chip-edit-btn"
                        style={{ color: 'var(--danger)', marginLeft: 4 }}
                        title="删除"
                        onClick={e => handleDelete(idea, e)}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Modal ── */}
      {modalOpen && (
        <div className="rp-modal-overlay" onClick={() => { if (modalMode !== 'edit') closeModal(); }}>
          <div className="rp-modal" onClick={e => e.stopPropagation()}>

            <div className="rp-modal-header">
              {modalMode === 'read' ? (
                <>
                  <div className="rp-modal-header-left">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {modalIdea?.categoryName && (
                        <span className="rp-global-sector-tag">{modalIdea.categoryName}</span>
                      )}
                      <span className="rp-modal-title-display">{modalIdea?.title}</span>
                    </div>
                    <div className="rp-modal-meta">
                      <div className="star-rating-inline" onClick={e => e.stopPropagation()}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <span
                            key={n}
                            className={`star-btn${(modalIdea?.rating ?? 0) >= n ? ' filled' : ''}`}
                            onClick={e => modalIdea && handleRating(modalIdea, n, e)}
                            title={`设为 ${n} 星`}
                          >
                            {(modalIdea?.rating ?? 0) >= n ? '★' : '☆'}
                          </span>
                        ))}
                      </div>
                      {modalIdea?.subCategory && (
                        <span className="research-meta-tag">{modalIdea.subCategory}</span>
                      )}
                      {modalIdea?.createdAt &&
                        <span className="research-meta-date">{new Date(modalIdea.createdAt).toLocaleDateString('zh-CN')}</span>}
                    </div>
                  </div>
                  <div className="rp-modal-header-right">
                    <button className="icon-btn" onClick={() => modalIdea && handleExportPdf(modalIdea)}>
                      ⬇ 导出PDF
                    </button>
                    <button className="icon-btn" onClick={() => modalIdea && switchToEdit(modalIdea)}>
                      ✎ 编辑
                    </button>
                    <button className="icon-btn" onClick={closeModal}>✕ 关闭</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rp-modal-header-left rp-modal-edit-meta">
                    <input
                      className="rp-modal-title-input"
                      placeholder="Idea 标题 *"
                      value={editTitle}
                      onChange={e => { setEditTitle(e.target.value); if (saveError) setSaveError(''); }}
                      autoFocus
                    />
                    <div className="rp-modal-meta-inputs">
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
                      <div className="star-rating-inline">
                        {[1, 2, 3, 4, 5].map(n => (
                          <span
                            key={n}
                            className={`star-btn${editRating >= n ? ' filled' : ''}`}
                            onClick={() => setEditRating(prev => prev === n ? 0 : n)}
                            title={`评为 ${n} 星`}
                          >
                            {editRating >= n ? '★' : '☆'}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="rp-modal-header-right">
                    {saveError && <span className="doc-save-error">{saveError}</span>}
                    {modalIdea && (
                      <button className="cancel-btn" style={{ color: 'var(--danger)' }}
                        onClick={() => handleDelete(modalIdea)} disabled={saving}>删除</button>
                    )}
                    <button className="cancel-btn"
                      onClick={() => { if (modalIdea) setModalMode('read'); else closeModal(); }}
                      disabled={saving}>取消</button>
                    <button className="confirm-btn" onClick={handleSave} disabled={saving}>
                      {saving ? '保存中…' : '保存 Idea'}
                    </button>
                    <button className="icon-btn" onClick={closeModal}>✕</button>
                  </div>
                </>
              )}
            </div>

            <div className="rp-modal-body">
              {modalMode === 'read' ? (
                /* ── Read mode: one unified scroll container ── */
                <div className="rp-modal-read-scroll">
                  <div className="rp-modal-read-content doc-read-view">
                    <DocEditor value={modalIdea?.content || ''} onChange={() => {}} readonly />
                  </div>

                  {/* Attachments – read mode */}
                  {attachments.length > 0 && (
                    <div className="idea-attachments-section">
                      <div className="idea-attachments-header">
                        <span className="idea-attachments-title">📎 附件 ({attachments.length})</span>
                      </div>
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
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comments – read mode */}
                  {modalIdea && (
                    <div className="idea-comments-section">
                      <div className="idea-comments-header">
                        <span className="idea-comments-title">💬 评论{comments.length > 0 ? ` (${comments.length})` : ''}</span>
                      </div>

                      {comments.length > 0 && (
                        <div className="idea-comments-list">
                          {comments.map(comment => (
                            <div key={comment.id} className="idea-comment-item">
                              {editingCommentId === comment.id ? (
                                <div className="idea-comment-edit-wrap">
                                  <textarea
                                    className="idea-comment-edit-textarea"
                                    value={editingCommentContent}
                                    onChange={e => setEditingCommentContent(e.target.value)}
                                    autoFocus
                                  />
                                  <div className="idea-comment-edit-actions">
                                    <button className="small-btn" onClick={() => handleUpdateComment(comment.id)}>保存</button>
                                    <button className="small-btn" onClick={() => { setEditingCommentId(null); setEditingCommentContent(''); }}>取消</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="idea-comment-content">{comment.content}</div>
                                  <div className="idea-comment-meta">
                                    <span className="idea-comment-time">
                                      {new Date(comment.createdAt).toLocaleString('zh-CN')}
                                      {comment.updatedAt !== comment.createdAt && ' (已编辑)'}
                                    </span>
                                    <div className="idea-comment-actions">
                                      <button
                                        className="idea-comment-action-btn"
                                        title="编辑"
                                        onClick={() => { setEditingCommentId(comment.id); setEditingCommentContent(comment.content); }}
                                      >✎</button>
                                      <button
                                        className="idea-comment-action-btn danger"
                                        title="删除"
                                        onClick={() => handleDeleteComment(comment.id)}
                                      >✕</button>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="idea-comment-input-wrap">
                        <textarea
                          className="idea-comment-textarea"
                          placeholder="写下你的评论…"
                          value={newComment}
                          onChange={e => setNewComment(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment();
                          }}
                          rows={2}
                        />
                        <button
                          className="idea-comment-submit-btn"
                          onClick={handleAddComment}
                          disabled={submittingComment || !newComment.trim()}
                        >
                          {submittingComment ? '发送中…' : '发送'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ── Edit mode: editor + attachments ── */
                <>
                  <div className="rp-modal-editor-wrap">
                    <DocEditor
                      ref={docEditorRef}
                      value={editContent}
                      onChange={v => { editContentRef.current = v; setEditContent(v); }}
                    />
                  </div>

                  {!!modalIdea && (
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
                </>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
