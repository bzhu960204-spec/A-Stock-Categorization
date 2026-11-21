import type { Dispatch, SetStateAction } from 'react';
import type { ValuationCompany } from '../../api';
import type { NumericField, SnapshotInput } from './valuationUtils';

type FieldRow =
  | { section: string }
  | { key: NumericField; label: string; step: string; placeholder: string };

const FIELD_ROWS: FieldRow[] = [
  { key: 'pe', label: 'PE', step: '0.01', placeholder: '留空' },
  { key: 'ps', label: 'PS', step: '0.01', placeholder: '留空' },
  { key: 'ntmPe', label: 'NTM PE', step: '0.01', placeholder: '留空' },
  { key: 'ntmPs', label: 'NTM PS', step: '0.01', placeholder: '留空' },
  { key: 'fcfMultiple', label: 'FCF Mul', step: '0.01', placeholder: '留空' },
  { key: 'fwdFcfMultiple', label: 'Fwd FCF Mul', step: '0.01', placeholder: '留空' },
  { key: 'grossMargin', label: '毛利率 %', step: '0.001', placeholder: '如 0.786' },

  { section: '过去四季度毛利率 %（Q1 = 最早季度）' },
  { key: 'grossMarginQ1', label: 'Q1 毛利率 %（最早）', step: '0.01', placeholder: '最近一个季度' },
  { key: 'grossMarginQ2', label: 'Q2 毛利率 %', step: '0.01', placeholder: '' },
  { key: 'grossMarginQ3', label: 'Q3 毛利率 %', step: '0.01', placeholder: '' },
  { key: 'grossMarginQ4', label: 'Q4 毛利率 %（最新）', step: '0.01', placeholder: '' },

  { key: 'netMargin', label: '净利率 %', step: '0.001', placeholder: '如 0.241' },
  { key: 'nonGaapNetMargin', label: 'Non-GAAP 净利率 %', step: '0.001', placeholder: '如 0.263，扣非 TTM' },

  { section: '过去四季度净利率 %（Q1 = 最早季度）' },
  { key: 'netMarginQ1', label: 'Q1 净利率 %（最早）', step: '0.01', placeholder: '最近一个季度' },
  { key: 'netMarginQ2', label: 'Q2 净利率 %', step: '0.01', placeholder: '' },
  { key: 'netMarginQ3', label: 'Q3 净利率 %', step: '0.01', placeholder: '' },
  { key: 'netMarginQ4', label: 'Q4 净利率 %（最新）', step: '0.01', placeholder: '' },

  { section: '近四年 TTM ROIC（Y1 = 最早，Y4 = 最新，小数形式如 0.35）' },
  { key: 'ttmRoicY1', label: 'Y1 ROIC（最早）', step: '0.001', placeholder: '如 0.28' },
  { key: 'ttmRoicY2', label: 'Y2 ROIC', step: '0.001', placeholder: '' },
  { key: 'ttmRoicY3', label: 'Y3 ROIC', step: '0.001', placeholder: '' },
  { key: 'ttmRoicY4', label: 'Y4 ROIC（最新，显示用）', step: '0.001', placeholder: '如 0.38' },
];

interface Props {
  editing: boolean;
  form: SnapshotInput;
  setForm: Dispatch<SetStateAction<SnapshotInput>>;
  companies: ValuationCompany[];
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export function ValuationFormModal({ editing, form, setForm, companies, saving, onCancel, onSave }: Props) {
  const numValue = (key: NumericField) => {
    const v = form[key];
    return v == null ? '' : String(v);
  };
  const setNum = (key: NumericField, raw: string) =>
    setForm(prev => ({ ...prev, [key]: raw === '' ? undefined : parseFloat(raw) }));

  return (
    <div className="val-form-overlay" onClick={onCancel}>
      <div className="val-form-modal" onClick={e => e.stopPropagation()}>
        <div className="val-form-title">
          {editing ? '编辑估值快照' : '添加估值快照'}
        </div>

        <div className="val-form-grid">
          <div className="val-form-group">
            <label className="val-form-label">股票代码 *</label>
            <input
              className="val-form-input"
              placeholder="如 AAPL / 600519"
              value={form.ticker}
              onChange={e => {
                const ticker = e.target.value.toUpperCase();
                const known = companies.find(c => c.ticker === ticker);
                setForm(prev => ({
                  ...prev,
                  ticker,
                  companyName: known ? known.companyName : prev.companyName,
                }));
              }}
            />
          </div>
          <div className="val-form-group">
            <label className="val-form-label">公司名称 *</label>
            <input
              className="val-form-input"
              placeholder="如 Apple Inc."
              value={form.companyName}
              onChange={e => setForm(prev => ({ ...prev, companyName: e.target.value }))}
            />
          </div>

          <div className="val-form-group full">
            <label className="val-form-label">快照日期 *</label>
            <input
              className="val-form-input"
              type="date"
              value={form.snapshotDate}
              onChange={e => setForm(prev => ({ ...prev, snapshotDate: e.target.value }))}
            />
          </div>

          {FIELD_ROWS.map(row => 'section' in row ? (
            <div key={row.section} className="val-form-group full val-form-section-label">{row.section}</div>
          ) : (
            <div key={row.key} className="val-form-group">
              <label className="val-form-label">{row.label}</label>
              <input
                className="val-form-input"
                type="number"
                step={row.step}
                placeholder={row.placeholder}
                value={numValue(row.key)}
                onChange={e => setNum(row.key, e.target.value)}
              />
            </div>
          ))}

          <div className="val-form-group full">
            <label className="val-form-label">备注</label>
            <textarea
              className="val-form-input"
              rows={3}
              placeholder="可选，如来源、市场环境等"
              value={form.notes ?? ''}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </div>

        <div className="val-form-actions">
          <button className="cancel-btn" onClick={onCancel}>取消</button>
          <button className="confirm-btn" disabled={saving} onClick={onSave}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
