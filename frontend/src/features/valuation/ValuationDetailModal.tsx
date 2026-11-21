import type { ValuationSnapshot } from '../../api';
import { avgGrossMargin, avgNetIncome, fmtNum } from './valuationUtils';

interface Props {
  snapshot: ValuationSnapshot;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

type PeriodValue = { label: string; val: number | null | undefined };

function PeriodSection({ title, values, average }: { title: string; values: PeriodValue[]; average?: number | null }) {
  if (!values.some(v => v.val != null)) return null;
  return (
    <div className="val-detail-section">
      <div className="val-detail-section-title">{title}</div>
      <div className="val-detail-quarters">
        {values.map(q => (
          <div key={q.label} className="val-detail-quarter">
            <div className="val-detail-quarter-label">{q.label}</div>
            <div className="val-detail-quarter-value">{fmtNum(q.val, true)}</div>
          </div>
        ))}
        {average !== undefined && (
          <div className="val-detail-quarter val-detail-quarter-avg">
            <div className="val-detail-quarter-label">季均</div>
            <div className="val-detail-quarter-value">{fmtNum(average, true)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ValuationDetailModal({ snapshot: s, onClose, onEdit, onDelete }: Props) {
  const metrics = [
    { label: 'PE',               value: fmtNum(s.pe) },
    { label: 'PS',               value: fmtNum(s.ps) },
    { label: 'NTM PE',           value: fmtNum(s.ntmPe) },
    { label: 'NTM PS',           value: fmtNum(s.ntmPs) },
    { label: 'FCF Mul',          value: fmtNum(s.fcfMultiple) },
    { label: 'Fwd FCF Mul',      value: fmtNum(s.fwdFcfMultiple) },
    { label: '毛利率',           value: fmtNum(s.grossMargin, true) },
    { label: '净利率',           value: fmtNum(s.netMargin, true) },
    { label: 'Non-GAAP 净利率',  value: fmtNum(s.nonGaapNetMargin, true) },
    { label: 'TTM ROIC',         value: fmtNum(s.ttmRoicY4, true) },
  ];

  return (
    <div className="val-form-overlay" onClick={onClose}>
      <div className="val-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="val-detail-header">
          <div className="val-detail-id">
            <span className="val-detail-ticker">{s.ticker}</span>
            <span className="val-detail-company">{s.companyName}</span>
          </div>
          <span className="val-detail-date">{s.snapshotDate}</span>
        </div>

        <div className="val-detail-metrics">
          {metrics.map(m => (
            <div key={m.label} className="val-detail-metric">
              <div className="val-detail-metric-label">{m.label}</div>
              <div className="val-detail-metric-value">{m.value}</div>
            </div>
          ))}
        </div>

        <PeriodSection
          title="过去四季度毛利率"
          values={[
            { label: 'Q1（最早）', val: s.grossMarginQ1 },
            { label: 'Q2',        val: s.grossMarginQ2 },
            { label: 'Q3',        val: s.grossMarginQ3 },
            { label: 'Q4（最新）', val: s.grossMarginQ4 },
          ]}
          average={avgGrossMargin(s)}
        />

        <PeriodSection
          title="过去四季度净利率"
          values={[
            { label: 'Q1（最早）', val: s.netMarginQ1 },
            { label: 'Q2',        val: s.netMarginQ2 },
            { label: 'Q3',        val: s.netMarginQ3 },
            { label: 'Q4（最新）', val: s.netMarginQ4 },
          ]}
          average={avgNetIncome(s)}
        />

        <PeriodSection
          title="近四年 TTM ROIC（Y1=最早，Y4=最新）"
          values={[
            { label: 'Y1（最早）', val: s.ttmRoicY1 },
            { label: 'Y2',        val: s.ttmRoicY2 },
            { label: 'Y3',        val: s.ttmRoicY3 },
            { label: 'Y4（最新）', val: s.ttmRoicY4 },
          ]}
        />

        {s.notes && (
          <div className="val-detail-section">
            <div className="val-detail-section-title">备注</div>
            <div className="val-detail-notes">{s.notes}</div>
          </div>
        )}

        <div className="val-form-actions">
          <button className="val-action-btn danger" onClick={onDelete}>删除</button>
          <div style={{ flex: 1 }} />
          <button className="cancel-btn" onClick={onClose}>关闭</button>
          <button className="confirm-btn" onClick={onEdit}>编辑</button>
        </div>
      </div>
    </div>
  );
}
