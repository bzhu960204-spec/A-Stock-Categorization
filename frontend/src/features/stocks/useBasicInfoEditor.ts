import { useState } from 'react';
import { getErrorMessage, updateStock, type Stock } from '../../api';
import type { BasicInfoDraft } from '../../BasicInfoModal';
import { useToast } from '../../shared/ui/feedback/useFeedback';

export function draftFromStock(stock: Stock): BasicInfoDraft {
  return {
    name: stock.name,
    code: stock.code,
    market: stock.market || 'CN',
    recommender: stock.recommender || '',
  };
}

/** State + save handler for the "basic info" (name / code / market / recommender) dialog. */
export function useBasicInfoEditor(onSaved: (stock: Stock) => void) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [stock, setStock] = useState<Stock | null>(null);
  const [draft, setDraft] = useState<BasicInfoDraft>({ name: '', code: '', market: 'CN', recommender: '' });
  const [saving, setSaving] = useState(false);

  const start = (target: Stock) => {
    setStock(target);
    setDraft(draftFromStock(target));
    setOpen(true);
  };

  const cancel = () => {
    setOpen(false);
    setStock(null);
  };

  const save = async () => {
    if (!stock) return;
    setSaving(true);
    try {
      // The update endpoint replaces every editable field, so send the full stock minus its categories.
      const rest: Partial<Stock> = { ...stock };
      delete rest.categories;
      const res = await updateStock(stock.id, { ...rest, ...draft });
      onSaved(res.data);
      setOpen(false);
      setStock(null);
    } catch (e) {
      toast.error(getErrorMessage(e, '保存基本信息失败'));
    } finally {
      setSaving(false);
    }
  };

  return {
    open: open && !!stock,
    draft,
    setDraft,
    saving,
    start,
    cancel,
    /** Overlay click only hides the dialog (matches the previous behaviour). */
    hide: () => setOpen(false),
    save,
  };
}
