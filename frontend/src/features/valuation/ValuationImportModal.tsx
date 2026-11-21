import { useState } from 'react';
import { parseImportJson, type ImportMode } from './valuationUtils';

interface Props {
  onClose: () => void;
  /** Persists the validated items; rejects when the backend call fails. */
  onImport: (items: Record<string, unknown>[], mode: ImportMode) => Promise<void>;
}

const EXAMPLE = `[
  {
    "ticker": "AAPL",
    "companyName": "Apple Inc.",
    "snapshotDate": "2026-05-16",
    "pe": 28.5,
    "ps": 7.2,
    "ntmPe": 25.0,
    "ntmPs": 6.8,
    "fcfMultiple": 32.0,
    "fwdFcfMultiple": 28.5,
    "grossMargin": 0.462,
    "grossMarginQ1": 0.465,
    "grossMarginQ2": 0.461,
    "grossMarginQ3": 0.458,
    "grossMarginQ4": 0.464,
    "netMargin": 0.241,
    "nonGaapNetMargin": 0.263,
    "netMarginQ1": 0.251,
    "netMarginQ2": 0.248,
    "netMarginQ3": 0.259,
    "netMarginQ4": 0.206,
    "ttmRoicY1": 0.28,
    "ttmRoicY2": 0.31,
    "ttmRoicY3": 0.35,
    "ttmRoicY4": 0.38,
    "notes": "可选备注"
  }
]`;

export function ValuationImportModal({ onClose, onImport }: Props) {
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<ImportMode>('add');

  const submit = async () => {
    setError(null);
    const parsed = parseImportJson(json, mode);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setImporting(true);
    try {
      await onImport(parsed.items, mode);
      onClose();
    } catch {
      setError('导入失败，请检查数据后重试');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="val-form-overlay" onClick={onClose}>
      <div className="val-form-modal val-import-modal" onClick={e => e.stopPropagation()}>
        <div className="val-form-title">批量导入估值快照（JSON）</div>

        <div className="val-import-mode-bar">
          <button
            className={`val-import-mode-btn${mode === 'add' ? ' active' : ''}`}
            onClick={() => setMode('add')}
          >
            ＋ 新增模式
          </button>
          <button
            className={`val-import-mode-btn${mode === 'update' ? ' active' : ''}`}
            onClick={() => setMode('update')}
          >
            ↻ 更新模式
          </button>
        </div>
        <p className="val-import-hint">
          {mode === 'add'
            ? <>粘贴 JSON 数组，每条记录必须包含 <code>ticker</code>、<code>companyName</code>、<code>snapshotDate</code>，其余字段可选。</>
            : <>更新模式：按 <code>ticker</code> 匹配<strong>最近一条</strong>快照并覆盖，<code>snapshotDate</code> 缺失时自动填今天；JSON 中为 <code>null</code> 的字段保留原值。找不到的 ticker 自动新增。</>
          }
        </p>
        <pre className="val-import-example">{EXAMPLE}</pre>
        <textarea
          className="val-form-input val-import-textarea"
          placeholder="在此粘贴 JSON…"
          value={json}
          onChange={e => { setJson(e.target.value); setError(null); }}
        />
        {error && <div className="val-import-error">{error}</div>}
        <div className="val-form-actions">
          <button className="cancel-btn" onClick={onClose}>取消</button>
          <button className="confirm-btn" disabled={importing || !json.trim()} onClick={submit}>
            {importing ? '处理中…' : mode === 'update' ? '确认更新' : '确认导入'}
          </button>
        </div>
      </div>
    </div>
  );
}
