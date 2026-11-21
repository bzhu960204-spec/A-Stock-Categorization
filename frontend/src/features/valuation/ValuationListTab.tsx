import type { ValuationSnapshot } from '../../api';
import { FILTER_KEYS, fmtNum, type FilterRule, type SortKey } from './valuationUtils';
import type { SnapshotListState } from './useSnapshotListState';
import { GrossMarginValue, NetMarginAvgValue, RoicValue, type TipHandlers } from './MetricValues';

interface Props extends TipHandlers {
  snapshots: ValuationSnapshot[];
  list: SnapshotListState;
  onOpen: (s: ValuationSnapshot) => void;
  onEdit: (s: ValuationSnapshot) => void;
  onDelete: (s: ValuationSnapshot) => void;
}

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'pe', label: 'PE' },
  { key: 'ps', label: 'PS' },
  { key: 'ntmPe', label: 'NTM PE' },
  { key: 'ntmPs', label: 'NTM PS' },
  { key: 'fcfMultiple', label: 'FCF Mul' },
  { key: 'fwdFcfMultiple', label: 'Fwd FCF Mul' },
  { key: 'avgGrossMargin', label: '毛利率(季均)' },
  { key: 'nonGaapNetMargin', label: 'NG 净利率' },
  { key: 'avgMargin', label: '净利率(季均)' },
  { key: 'ttmRoicY4', label: 'TTM ROIC' },
];

export function ValuationListTab({ snapshots, list, onOpen, onEdit, onDelete, ...tip }: Props) {
  const { searchQuery, setSearchQuery, rules, logic, sort, visible } = list;

  const sortIcon = (key: SortKey) => sort.key !== key
    ? <span className="val-sort-icon">⇅</span>
    : <span className="val-sort-icon active">{sort.dir === 'asc' ? '↑' : '↓'}</span>;

  return (
    <>
      <div className="val-search-bar">
        <span className="val-search-icon">⌕</span>
        <input
          className="val-search-input"
          placeholder="搜索股票代码、公司名称或备注…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="val-search-clear" onClick={() => setSearchQuery('')}>✕</button>
        )}
        <span className="val-search-count">
          {visible.length} / {snapshots.length} 条
        </span>
        <button className="val-filter-add-btn" onClick={list.addRule}>⧹ 筛选</button>
      </div>

      {rules.length > 0 && (
        <div className="val-filter-bar">
          {rules.map((f, i) => (
            <div key={f.id} className="val-filter-row">
              {i === 0 ? (
                <span className="val-filter-where">满足</span>
              ) : (
                <button className="val-filter-logic-btn" onClick={list.toggleLogic}>{logic}</button>
              )}
              <select
                className="val-filter-select"
                value={f.key}
                onChange={e => list.updateRule(f.id, { key: e.target.value as FilterRule['key'] })}
              >
                {FILTER_KEYS.map(k => (
                  <option key={k.key} value={k.key}>{k.label}</option>
                ))}
              </select>
              <select
                className="val-filter-select val-filter-op"
                value={f.op}
                onChange={e => list.updateRule(f.id, { op: e.target.value as FilterRule['op'] })}
              >
                <option value="<">&lt;</option>
                <option value="<=">&le;</option>
                <option value="=">=</option>
                <option value=">=">&ge;</option>
                <option value=">">&gt;</option>
              </select>
              <input
                className="val-filter-input"
                type="number"
                step="any"
                placeholder="数字"
                value={f.value}
                onChange={e => list.updateRule(f.id, { value: e.target.value })}
              />
              <button className="val-filter-remove" onClick={() => list.removeRule(f.id)}>✕</button>
            </div>
          ))}
          <button className="val-filter-clear" onClick={list.clearRules}>清除全部</button>
        </div>
      )}

      <div className="val-table-wrap">
        <table className="val-table">
          <thead>
            <tr>
              <th className="val-th-sort" onClick={() => list.toggleSort('snapshotDate')}>快照日期{sortIcon('snapshotDate')}</th>
              <th>代码</th>
              {SORT_COLUMNS.map(c => (
                <th key={c.key} className="val-th-sort" onClick={() => list.toggleSort(c.key)}>{c.label}{sortIcon(c.key)}</th>
              ))}
              <th className="val-th-actions"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={13} className="val-empty">
                  {snapshots.length === 0
                    ? '暂无数据，点击右上角「+ 添加快照」开始记录'
                    : `没有匹配「${searchQuery}」的记录`}
                </td>
              </tr>
            )}
            {visible.map(s => (
              <tr key={s.id} className="val-row val-row-clickable" onClick={() => onOpen(s)}>
                <td className="val-date">{s.snapshotDate}</td>
                <td><strong>{s.ticker}</strong></td>
                <td className="val-num">{fmtNum(s.pe)}</td>
                <td className="val-num">{fmtNum(s.ps)}</td>
                <td className="val-num">{fmtNum(s.ntmPe)}</td>
                <td className="val-num">{fmtNum(s.ntmPs)}</td>
                <td className="val-num">{fmtNum(s.fcfMultiple)}</td>
                <td className="val-num">{fmtNum(s.fwdFcfMultiple)}</td>
                <td className="val-num"><GrossMarginValue s={s} {...tip} /></td>
                <td className="val-num">{fmtNum(s.nonGaapNetMargin, true)}</td>
                <td className="val-num"><NetMarginAvgValue s={s} {...tip} /></td>
                <td className="val-num"><RoicValue s={s} {...tip} /></td>
                <td className="val-td-actions" onClick={e => e.stopPropagation()}>
                  <div className="val-row-actions">
                    <button className="val-action-icon-btn" title="编辑" onClick={() => onEdit(s)}>✎</button>
                    <button className="val-action-icon-btn danger" title="删除" onClick={() => onDelete(s)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
