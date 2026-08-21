import { useState, type ReactNode } from 'react';

interface CategoryLike {
  id: number;
  name: string;
}

interface Props<T extends CategoryLike> {
  categories: T[];
  filter: number | null;
  onSelect: (id: number | null) => void;
  onAdd: (name: string) => void | Promise<void>;
  onUpdate: (id: number, name: string) => void | Promise<void>;
  onDelete: (cat: T) => void | Promise<void>;
  onArchiveFolder?: (cat: T) => void | Promise<void>;
  onRestoreFolder?: (cat: T) => void | Promise<void>;
  title?: string;
  /** Show the inline "全部" chip at the top of the list. */
  showAll?: boolean;
  /** Render the "全部" chip full-width. */
  fullWidthAll?: boolean;
  /** Allow adding new folders (hides the + button when false). */
  canAdd?: boolean;
  /** Allow renaming folders (hides the ✎ button when false). */
  canEdit?: boolean;
  /** Show an inline filter input to search folders by name. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** When provided, each folder chip becomes a drop target; called on drop. */
  onDropItem?: (cat: T) => void;
  /** Extra content rendered below the folder list (e.g. archived toggle). */
  footer?: ReactNode;
}

/** Shared category / folder sidebar used by the research, idea and trade document modules. */
export default function CategorySidebar<T extends CategoryLike>({
  categories,
  filter,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  onArchiveFolder,
  onRestoreFolder,
  title = '分类',
  showAll = true,
  fullWidthAll = false,
  canAdd = true,
  canEdit = true,
  searchable = false,
  searchPlaceholder = '过滤分类…',
  onDropItem,
  footer,
}: Props<T>) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<T | null>(null);
  const [editName, setEditName] = useState('');
  const [search, setSearch] = useState('');
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const submitAdd = async () => {
    if (!newName.trim()) return;
    await onAdd(newName.trim());
    setNewName('');
    setShowAdd(false);
  };

  const submitUpdate = async () => {
    if (!editing || !editName.trim()) return;
    await onUpdate(editing.id, editName.trim());
    setEditing(null);
  };

  const shownCategories = searchable
    ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : categories;

  return (
    <aside className="glass-sidebar idea-sidebar">
      <div className="sidebar-section">
        <div className="section-header">
          <h3>{title}</h3>
          {canAdd && (
            <button className="small-btn" title="新增分类" onClick={() => setShowAdd(true)}>+</button>
          )}
        </div>

        {showAdd && (
          <div className="inline-add-row">
            <input
              className="inline-input"
              placeholder="分类名称"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitAdd();
                if (e.key === 'Escape') { setShowAdd(false); setNewName(''); }
              }}
              autoFocus
            />
            <button className="small-btn" onClick={submitAdd}>✓</button>
            <button className="small-btn" onClick={() => { setShowAdd(false); setNewName(''); }}>✕</button>
          </div>
        )}

        {searchable && (
          <div style={{ position: 'relative', marginBottom: '6px' }}>
            <input
              className="cat-filter-search-input"
              placeholder={searchPlaceholder}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="cat-filter-search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>
        )}

        <div className="category-list">
          {showAll && (
            <div className="category-chip-row">
              <button
                className={`category-chip ${filter === null ? 'selected' : ''}`}
                style={{ '--chip-color': 'var(--accent)', ...(fullWidthAll ? { width: '100%' } : {}) } as React.CSSProperties}
                onClick={() => onSelect(null)}
              >
                <span className="chip-name">全部</span>
              </button>
            </div>
          )}

          {shownCategories.map(cat => (
            <div key={cat.id} className="category-chip-row">
              {editing?.id === cat.id ? (
                <div className="inline-add-row" style={{ flex: 1 }}>
                  <input
                    className="inline-input"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitUpdate();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    autoFocus
                  />
                  <button className="small-btn" onClick={submitUpdate}>✓</button>
                  <button className="small-btn" onClick={() => setEditing(null)}>✕</button>
                </div>
              ) : (
                <>
                  <button
                    className={`category-chip ${filter === cat.id ? 'selected' : ''}${dragOverId === cat.id ? ' drag-over' : ''}`}
                    style={{ '--chip-color': 'var(--accent)' } as React.CSSProperties}
                    onClick={() => onSelect(cat.id)}
                    onDragOver={onDropItem ? e => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverId !== cat.id) setDragOverId(cat.id);
                    } : undefined}
                    onDragLeave={onDropItem ? () => { if (dragOverId === cat.id) setDragOverId(null); } : undefined}
                    onDrop={onDropItem ? e => { e.preventDefault(); setDragOverId(null); onDropItem(cat); } : undefined}
                  >
                    <span className="chip-name">{cat.name}</span>
                  </button>
                  {canEdit && (
                    <button className="chip-edit-btn" title="编辑"
                      onClick={() => { setEditing(cat); setEditName(cat.name); }}>✎</button>
                  )}
                  {onArchiveFolder && (
                    <button className="chip-edit-btn" title="归档整个文件夹"
                      onClick={() => onArchiveFolder(cat)}>📥</button>
                  )}
                  {onRestoreFolder && (
                    <button className="chip-edit-btn" title="恢复整个文件夹"
                      onClick={() => onRestoreFolder(cat)}>♻️</button>
                  )}
                  <button className="chip-edit-btn" title="删除" style={{ color: 'var(--danger)' }}
                    onClick={() => onDelete(cat)}>✕</button>
                </>
              )}
            </div>
          ))}
        </div>

        {footer}
      </div>
    </aside>
  );
}
