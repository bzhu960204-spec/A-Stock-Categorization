import type { Stock } from './api';

interface StockTableProps {
  stocks: Stock[];
  onOpenProfile: (stock: Stock) => void;
  onEditBasicInfo: (stock: Stock) => void;
  onSetResearchValue: (stock: Stock, newVal: number) => void;
  onAssign: (stock: Stock) => void;
  onTimeline: (stock: Stock) => void;
  onDocument: (stock: Stock) => void;
  onDelete: (stock: Stock) => void;
}

export function StockTable({
  stocks, onOpenProfile, onEditBasicInfo, onSetResearchValue,
  onAssign, onTimeline, onDocument, onDelete,
}: Readonly<StockTableProps>) {
  if (stocks.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无股票数据</p>
        <p className="empty-sub">点击"添加股票"开始</p>
      </div>
    );
  }

  return (
    <table className="glass-table">
      <thead>
        <tr>
          <th>代码</th>
          <th>名称</th>
          <th>备注</th>
          <th>研究价值</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {stocks.map(stock => (
          <tr key={stock.id} className="stock-row" onClick={() => onOpenProfile(stock)}>
            <td
              className="stock-code clickable-code"
              title="点击编辑基本信息"
              onClick={e => { e.stopPropagation(); onEditBasicInfo(stock); }}
            >
              <span className={`market-badge market-badge-${(stock.market || 'CN').toLowerCase()}`}>{stock.market || 'CN'}</span>
              {stock.code}
            </td>
            <td className="stock-name">
              <div className="stock-name-main">{stock.name}</div>
              {stock.categories && stock.categories.length > 0 && (
                <div className="stock-cat-dots">
                  {stock.categories.map(cat => (
                    <span
                      key={cat.id}
                      className="cat-dot"
                      title={cat.name}
                      style={{ background: cat.color || '#6366f1' } as React.CSSProperties}
                    />
                  ))}
                </div>
              )}
            </td>
            <td className="stock-notes">{stock.notes || '-'}</td>
            <td className="stock-research" onClick={e => e.stopPropagation()}>
              <div className="star-rating-inline">
                {[1, 2, 3, 4, 5].map(n => (
                  <span
                    key={n}
                    className={`star-btn ${(stock.researchValue ?? 0) >= n ? 'filled' : ''}`}
                    onClick={() => onSetResearchValue(stock, (stock.researchValue ?? 0) === n ? 0 : n)}
                    title={`设为 ${n} 星`}
                  >
                    {(stock.researchValue ?? 0) >= n ? '★' : '☆'}
                  </span>
                ))}
              </div>
            </td>
            <td className="stock-actions" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                className="action-btn"
                title="设置分类"
                onClick={() => onAssign(stock)}
              >🏷️</button>
              <button
                type="button"
                className="action-btn timeline"
                title="查看时间线"
                onClick={() => onTimeline(stock)}
              >⏱️</button>
              <button
                type="button"
                className="action-btn document"
                title="研究日志"
                onClick={() => onDocument(stock)}
              >📄</button>
              <button
                type="button"
                className="action-btn danger"
                title="删除"
                onClick={() => onDelete(stock)}
              >🗑️</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
