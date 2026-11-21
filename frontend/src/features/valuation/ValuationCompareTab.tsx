import { useMemo } from 'react';
import type { ValuationCompany, ValuationSnapshot } from '../../api';
import { METRICS, bestMetricValue, fmtNum, latestByTicker, metricValue } from './valuationUtils';
import { GrossMarginValue, RoicValue, type TipHandlers } from './MetricValues';

interface Props extends TipHandlers {
  snapshots: ValuationSnapshot[];
  companies: ValuationCompany[];
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export function ValuationCompareTab({ snapshots, companies, selected, onSelectedChange, search, onSearchChange: setSearch, ...tip }: Props) {
  const cq = search.trim().toLowerCase();
  const filteredCompanies = cq
    ? companies.filter(c => c.ticker.toLowerCase().includes(cq) || c.companyName.toLowerCase().includes(cq))
    : companies;

  const latest = useMemo(() => latestByTicker(snapshots), [snapshots]);
  const compared = selected.map(t => latest[t]).filter((s): s is ValuationSnapshot => s != null);

  const toggle = (ticker: string) =>
    onSelectedChange(selected.includes(ticker) ? selected.filter(t => t !== ticker) : [...selected, ticker]);

  return (
    <>
      <div className="val-compare-selector">
        <div className="val-compare-top">
          <span className="val-compare-label">选择公司（最新快照对比）：</span>
          {selected.length > 0 && (
            <button className="val-clear-btn" onClick={() => onSelectedChange([])}>清除选择</button>
          )}
        </div>
        <div className="val-compare-search-wrap">
          <span className="val-search-icon">⌕</span>
          <input
            className="val-search-input val-compare-search-input"
            placeholder="输入代码或公司名筛选…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="val-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>
        <div className="val-compare-chips">
          {companies.length === 0 && (
            <span className="val-compare-empty-hint">请先在「快照记录」中添加数据</span>
          )}
          {filteredCompanies.length === 0 && companies.length > 0 && (
            <span className="val-compare-empty-hint">没有匹配的公司</span>
          )}
          {filteredCompanies.map(c => (
            <button
              key={c.ticker}
              className={`val-filter-chip${selected.includes(c.ticker) ? ' active' : ''}`}
              onClick={() => toggle(c.ticker)}
            >
              {c.ticker} · {c.companyName}
            </button>
          ))}
        </div>
      </div>

      {compared.length === 0 ? (
        <div className="val-empty" style={{ marginTop: 40 }}>
          {companies.length === 0
            ? '暂无数据，请先添加估值快照'
            : '请在上方勾选公司进行对比（支持多选）'}
        </div>
      ) : (
        <div className="val-table-wrap">
          <table className="val-cmp-table">
            <thead>
              <tr>
                <th className="val-cmp-metric-header">指标</th>
                {compared.map(s => (
                  <th key={s.ticker} className="val-cmp-company-header">
                    <div className="val-cmp-ticker">{s.ticker}</div>
                    <div className="val-cmp-name">{s.companyName}</div>
                    <div className="val-cmp-date">@ {s.snapshotDate}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map(m => {
                const best = bestMetricValue(compared, m);
                return (
                  <tr key={m.key}>
                    <td className="val-cmp-metric-label">{m.label}</td>
                    {compared.map(s => {
                      const val = metricValue(s, m);
                      const isBest = val != null && val === best;
                      return (
                        <td key={s.ticker} className={`val-cmp-cell${isBest ? ' best' : ''}`}>
                          {m.key === 'grossMargin' ? <GrossMarginValue s={s} {...tip} />
                            : m.key === 'ttmRoicY4' ? <RoicValue s={s} {...tip} />
                            : fmtNum(val, m.isPercent)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
