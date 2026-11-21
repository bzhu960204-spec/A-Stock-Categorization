import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ThemePicker } from '../../ThemePicker';
import {
  getValuationSnapshots,
  getValuationCompanies,
  createValuationSnapshot,
  updateValuationSnapshot,
  deleteValuationSnapshot,
  type ValuationSnapshot,
  getErrorMessage,
} from '../../api';
import { useConfirm, useToast } from '../../shared/ui/feedback/useFeedback';
import {
  buildImportTemplate, emptyForm, formFromSnapshot, importItemToInput, latestByTicker, mergeImportIntoExisting,
  type ImportMode, type SnapshotInput,
} from './valuationUtils';
import { useHoverTip } from './useHoverTip';
import { useSnapshotListState } from './useSnapshotListState';
import { HoverTip } from './MetricValues';
import { ValuationListTab } from './ValuationListTab';
import { ValuationCompareTab } from './ValuationCompareTab';
import { ValuationDetailModal } from './ValuationDetailModal';
import { ValuationImportModal } from './ValuationImportModal';
import { ValuationFormModal } from './ValuationFormModal';

type TabId = 'list' | 'compare';

const VALUATIONS_KEY = ['valuations'] as const;
const NO_SNAPSHOTS: ValuationSnapshot[] = [];

interface Props {
  onGoHome: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ValuationModule({ onGoHome }: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: VALUATIONS_KEY,
    queryFn: async () => {
      const [snapRes, compRes] = await Promise.all([getValuationSnapshots(), getValuationCompanies()]);
      return { snapshots: snapRes.data, companies: compRes.data };
    },
  });
  const snapshots = data?.snapshots ?? NO_SNAPSHOTS;
  const companies = data?.companies ?? [];
  const reload = () => queryClient.invalidateQueries({ queryKey: VALUATIONS_KEY });

  const [tab, setTab] = useState<TabId>('list');
  const list = useSnapshotListState(snapshots);
  const [compareSearch, setCompareSearch] = useState('');
  const [compareSelected, setCompareSelected] = useState<string[]>([]);
  const { tip, open: openTip, close: closeTip } = useHoverTip();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SnapshotInput>(() => emptyForm());
  const [saving, setSaving] = useState(false);
  const [detailSnapshot, setDetailSnapshot] = useState<ValuationSnapshot | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(s: ValuationSnapshot) {
    setEditingId(s.id);
    setForm(formFromSnapshot(s));
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
  }

  async function handleImport(items: Record<string, unknown>[], mode: ImportMode) {
    const date = today();
    const latest = latestByTicker(snapshots);
    for (const it of items) {
      const existing = mode === 'update' ? latest[String(it.ticker).toUpperCase()] : undefined;
      if (existing) {
        await updateValuationSnapshot(existing.id, mergeImportIntoExisting(it, existing, date));
      } else {
        // Add mode, or update mode with an unknown ticker: create a new snapshot.
        await createValuationSnapshot(importItemToInput(it, date));
      }
    }
    void reload();
  }

  async function handleSave() {
    const ticker = form.ticker.trim().toUpperCase();
    const companyName = form.companyName.trim();
    if (!ticker || !companyName || !form.snapshotDate) {
      toast.error('请填写股票代码、公司名称和快照日期');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, ticker, companyName };
      if (editingId != null) {
        await updateValuationSnapshot(editingId, payload);
      } else {
        await createValuationSnapshot(payload);
      }
      closeForm();
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败，请重试。'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, onDone?: () => void) {
    if (!await confirm({ message: '确定删除这条快照记录？', confirmText: '删除', danger: true })) return;
    try {
      await deleteValuationSnapshot(id);
    } catch (err) {
      toast.error(getErrorMessage(err, '删除失败，请重试。'));
      return;
    }
    await reload();
    onDone?.();
  }

  const tipHandlers = { openTip, closeTip };

  return (
    <div className="app-container">
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome} title="返回主页">⌂</button>
          <h1 className="app-title">估值比较</h1>
        </div>
        <div className="header-right">
          <button className="val-import-btn" onClick={() => setImportOpen(true)}>↑ 导入 JSON</button>
          <button
            className="val-import-btn"
            onClick={() => downloadJson(buildImportTemplate(companies), `valuation-template-${today()}.json`)}
            title="导出包含所有公司的空白模板，填入最新数据后再导入"
          >↓ 导出模板</button>
          <button className="confirm-btn" onClick={openAdd}>+ 添加快照</button>
          <ThemePicker />
        </div>
      </header>

      <div className="val-tab-bar">
        <button className={`val-tab-btn${tab === 'list' ? ' active' : ''}`} onClick={() => setTab('list')}>
          快照记录
        </button>
        <button className={`val-tab-btn${tab === 'compare' ? ' active' : ''}`} onClick={() => setTab('compare')}>
          对比分析
        </button>
      </div>

      <div className="val-body">
        {tab === 'list' && (
          <ValuationListTab
            snapshots={snapshots}
            list={list}
            onOpen={setDetailSnapshot}
            onEdit={openEdit}
            onDelete={s => handleDelete(s.id)}
            {...tipHandlers}
          />
        )}
        {tab === 'compare' && (
          <ValuationCompareTab
            snapshots={snapshots}
            companies={companies}
            selected={compareSelected}
            onSelectedChange={setCompareSelected}
            search={compareSearch}
            onSearchChange={setCompareSearch}
            {...tipHandlers}
          />
        )}
      </div>

      {detailSnapshot && (
        <ValuationDetailModal
          snapshot={detailSnapshot}
          onClose={() => setDetailSnapshot(null)}
          onDelete={() => handleDelete(detailSnapshot.id, () => setDetailSnapshot(null))}
          onEdit={() => {
            setDetailSnapshot(null);
            openEdit(detailSnapshot);
          }}
        />
      )}

      {importOpen && (
        <ValuationImportModal onClose={() => setImportOpen(false)} onImport={handleImport} />
      )}

      {formOpen && (
        <ValuationFormModal
          editing={editingId != null}
          form={form}
          setForm={setForm}
          companies={companies}
          saving={saving}
          onCancel={closeForm}
          onSave={handleSave}
        />
      )}

      <HoverTip tip={tip} />
    </div>
  );
}