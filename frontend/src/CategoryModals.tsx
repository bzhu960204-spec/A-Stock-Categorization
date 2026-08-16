import type { CSSProperties } from 'react';
import { PRESET_COLORS } from './constants';
import type { Category, Stock } from './api';

interface AddCategoryModalProps {
  open: boolean;
  name: string;
  desc: string;
  color: string;
  onNameChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function AddCategoryModal({
  open, name, desc, color, onNameChange, onDescChange, onColorChange, onClose, onConfirm,
}: AddCategoryModalProps) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-modal cat-form-modal" onClick={e => e.stopPropagation()}>
        <h2>新建分类</h2>
        <div className="form-group">
          <label>分类名称</label>
          <input
            type="text"
            placeholder="如 白酒、新能源、AI算力..."
            value={name}
            onChange={e => onNameChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onConfirm()}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>说明 <span className="form-optional">（可选）</span></label>
          <input
            type="text"
            placeholder="简要描述这个分类涵盖的范围..."
            value={desc}
            onChange={e => onDescChange(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>颜色</label>
          <div className="color-swatch-grid">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                className={`color-swatch ${color === c ? 'active' : ''}`}
                style={{ '--swatch-color': c } as CSSProperties}
                onClick={() => onColorChange(c)}
              />
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>取消</button>
          <button className="confirm-btn" onClick={onConfirm} disabled={!name.trim()}>创建</button>
        </div>
      </div>
    </div>
  );
}

interface EditCategoryModalProps {
  editingCategory: Category | null;
  name: string;
  desc: string;
  color: string;
  onNameChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
  onRequestDelete: (cat: Category) => void;
}

export function EditCategoryModal({
  editingCategory, name, desc, color, onNameChange, onDescChange, onColorChange, onClose, onSave, onRequestDelete,
}: EditCategoryModalProps) {
  if (!editingCategory) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-modal cat-form-modal" onClick={e => e.stopPropagation()}>
        <h2>编辑分类</h2>
        <div className="form-group">
          <label>分类名称</label>
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSave()}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>说明 <span className="form-optional">（可选）</span></label>
          <input
            type="text"
            placeholder="简要描述这个分类涵盖的范围..."
            value={desc}
            onChange={e => onDescChange(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>颜色</label>
          <div className="color-swatch-grid">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                className={`color-swatch ${color === c ? 'active' : ''}`}
                style={{ '--swatch-color': c } as CSSProperties}
                onClick={() => onColorChange(c)}
              />
            ))}
          </div>
        </div>
        <div className="cat-form-footer">
          <button
            className="cat-delete-btn"
            onClick={() => onRequestDelete(editingCategory)}
          >删除分类</button>
          <div className="modal-actions" style={{ padding: 0 }}>
            <button className="cancel-btn" onClick={onClose}>取消</button>
            <button className="confirm-btn" onClick={onSave} disabled={!name.trim()}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DeleteCategoryConfirmModalProps {
  pendingDeleteCategory: Category | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteCategoryConfirmModal({
  pendingDeleteCategory, onCancel, onConfirm,
}: DeleteCategoryConfirmModalProps) {
  if (!pendingDeleteCategory) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="glass-modal delete-confirm-modal" onClick={e => e.stopPropagation()}>
        <h2>确认删除分类</h2>
        <div className="delete-confirm-body">
          <p className="delete-confirm-text">即将删除分类：</p>
          <p className="delete-confirm-target">{pendingDeleteCategory.name}</p>
          <p className="delete-confirm-sub">已关联此分类的股票不会被删除，只是移除关联。</p>
        </div>
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onCancel}>取消</button>
          <button className="confirm-btn danger" onClick={onConfirm}>确认删除</button>
        </div>
      </div>
    </div>
  );
}

interface AssignCategoriesModalProps {
  assignStock: Stock | null;
  categories: Category[];
  assignedIds: Set<number>;
  setAssignedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  assignSearch: string;
  onSearchChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function AssignCategoriesModal({
  assignStock, categories, assignedIds, setAssignedIds, assignSearch, onSearchChange, onClose, onSave,
}: AssignCategoriesModalProps) {
  if (!assignStock) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-modal assign-modal" onClick={e => e.stopPropagation()}>
        <div className="assign-modal-header">
          <h2>设置分类</h2>
          <span className="assign-modal-stock">{assignStock.code}&nbsp;{assignStock.name}</span>
        </div>
        {categories.length > 5 && (
          <div className="assign-search-box">
            <input
              className="assign-search-input"
              type="text"
              placeholder="搜索分类..."
              value={assignSearch}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
        )}
        <div className="assign-tag-cloud">
          {categories
            .filter(cat =>
              !assignSearch ||
              cat.name.toLowerCase().includes(assignSearch.toLowerCase()) ||
              (cat.description || '').toLowerCase().includes(assignSearch.toLowerCase())
            )
            .map(cat => {
              const selected = assignedIds.has(cat.id);
              return (
                <button
                  key={cat.id}
                  className={`assign-tag ${selected ? 'selected' : ''}`}
                  style={{ '--cat-color': cat.color || '#6366f1' } as CSSProperties}
                  title={cat.description || ''}
                  onClick={() => {
                    setAssignedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(cat.id)) next.delete(cat.id);
                      else next.add(cat.id);
                      return next;
                    });
                  }}
                >
                  <span className="assign-tag-dot" />
                  <span>{cat.name}</span>
                  {selected && <span className="assign-tag-check">✓</span>}
                </button>
              );
            })}
          {categories.length === 0 && <p className="empty-hint">请先在左侧栏添加分类</p>}
        </div>
        {assignedIds.size > 0 && (
          <div className="assign-selected-summary">已选 {assignedIds.size} 个分类</div>
        )}
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>取消</button>
          <button className="confirm-btn" onClick={onSave}>保存</button>
        </div>
      </div>
    </div>
  );
}

interface DeleteStockConfirmModalProps {
  pendingDeleteStock: Stock | null;
  deletingStock: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteStockConfirmModal({
  pendingDeleteStock, deletingStock, onCancel, onConfirm,
}: DeleteStockConfirmModalProps) {
  if (!pendingDeleteStock) return null;
  return (
    <div className="modal-overlay" onClick={() => !deletingStock && onCancel()}>
      <div className="glass-modal delete-confirm-modal" onClick={e => e.stopPropagation()}>
        <h2>确认删除</h2>
        <div className="delete-confirm-body">
          <p className="delete-confirm-text">你将删除以下股票：</p>
          <p className="delete-confirm-target">{pendingDeleteStock.code} {pendingDeleteStock.name}</p>
          <p className="delete-confirm-sub">此操作不可撤销，相关分类关联和后续编辑入口将被移除。</p>
        </div>
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onCancel} disabled={deletingStock}>取消</button>
          <button className="confirm-btn" onClick={onConfirm} disabled={deletingStock}>
            {deletingStock ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}
