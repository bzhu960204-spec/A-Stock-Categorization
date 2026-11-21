import { useState } from 'react';
import { PRESET_COLORS } from '../../constants';
import { createCategory, deleteCategory, getErrorMessage, updateCategory, type Category } from '../../api';
import { useToast } from '../../shared/ui/feedback/useFeedback';

/** Picks a preset colour not used by any existing category (random among the free ones). */
export function pickUnusedColor(categories: Category[], random: () => number = Math.random): string {
  const used = new Set(categories.map(c => c.color));
  const unused = PRESET_COLORS.filter(c => !used.has(c));
  const pool = unused.length > 0 ? unused : PRESET_COLORS;
  return pool[Math.floor(random() * pool.length)];
}

interface Options {
  categories: Category[];
  /** Called after any successful create / update / delete. */
  onChanged: () => void;
  onDeleted: (id: number) => void;
}

/** State + handlers for the add / edit / delete category dialogs of the stocks page. */
export function useCategoryManager({ categories, onChanged, onDeleted }: Options) {
  const toast = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [newDesc, setNewDesc] = useState('');

  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]);
  const [editDesc, setEditDesc] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  const openAdd = () => {
    setShowAdd(true);
    setNewColor(pickUnusedColor(categories));
    setNewDesc('');
  };

  const closeAdd = () => {
    setShowAdd(false);
    setNewName('');
    setNewDesc('');
  };

  const confirmAdd = async () => {
    if (!newName) return;
    try {
      await createCategory({ name: newName, color: newColor, description: newDesc.trim() || undefined });
      setShowAdd(false);
      setNewName('');
      setNewDesc('');
      setNewColor(pickUnusedColor(categories));
      onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e, '添加分类失败'));
    }
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setEditName(cat.name);
    setEditColor(cat.color || PRESET_COLORS[0]);
    setEditDesc(cat.description || '');
  };

  const saveEdit = async () => {
    if (!editing || !editName.trim()) return;
    try {
      await updateCategory(editing.id, {
        name: editName.trim(),
        color: editColor,
        description: editDesc.trim() || undefined,
      });
      setEditing(null);
      onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e, '保存分类失败'));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteCategory(pendingDelete.id);
      onDeleted(pendingDelete.id);
      setPendingDelete(null);
      setEditing(null);
      onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e, '删除分类失败'));
    }
  };

  return {
    add: { open: showAdd, name: newName, color: newColor, desc: newDesc, setName: setNewName, setColor: setNewColor, setDesc: setNewDesc, openAdd, close: closeAdd, confirm: confirmAdd },
    edit: { category: editing, name: editName, color: editColor, desc: editDesc, setName: setEditName, setColor: setEditColor, setDesc: setEditDesc, open: openEdit, close: () => setEditing(null), save: saveEdit },
    remove: { pending: pendingDelete, request: setPendingDelete, cancel: () => setPendingDelete(null), confirm: confirmDelete },
  };
}
