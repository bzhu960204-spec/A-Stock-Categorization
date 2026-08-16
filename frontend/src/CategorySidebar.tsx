import { useState } from 'react';

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
  title?: string;
}

/** Shared category filter sidebar used by the Idea and Trade modules. */
export default function CategorySidebar<T extends CategoryLike>({
  categories,
  filter,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  title = '分类',
}: Props<T>) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<T | null>(null);
  const [editName, setEditName] = useState('');

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

  return (
    <aside className="glass-sidebar idea-sidebar">
      <div className="sidebar-section">
        <div className="section-header">
          <h3>{title}</h3>
          <button className="small-btn" title="新增分类" onClick={() => setShowAdd(true)}>+</button>
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

        <div className="category-list">
          <div className="category-chip-row">
            <button
              className={`category-chip ${filter === null ? 'selected' : ''}`}
              style={{ '--chip-color': 'var(--accent)' } as React.CSSProperties}
              onClick={() => onSelect(null)}
            >
              <span className="chip-name">全部</span>
            </button>
          </div>

          {categories.map(cat => (
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
                    className={`category-chip ${filter === cat.id ? 'selected' : ''}`}
                    style={{ '--chip-color': 'var(--accent)' } as React.CSSProperties}
                    onClick={() => onSelect(cat.id)}
                  >
                    <span className="chip-name">{cat.name}</span>
                  </button>
                  <button className="chip-edit-btn" title="编辑"
                    onClick={() => { setEditing(cat); setEditName(cat.name); }}>✎</button>
                  <button className="chip-edit-btn" title="删除" style={{ color: 'var(--danger)' }}
                    onClick={() => onDelete(cat)}>✕</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
