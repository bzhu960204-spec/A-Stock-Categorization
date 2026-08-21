import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Stock } from './api';

interface RowActionsProps {
  stock: Stock;
  archivedView: boolean;
  onAssign: (stock: Stock) => void;
  onTimeline: (stock: Stock) => void;
  onDocument: (stock: Stock) => void;
  onDelete: (stock: Stock) => void;
  onArchive?: (stock: Stock) => void;
  onUnarchive?: (stock: Stock) => void;
}

function RowActions({
  stock, archivedView, onAssign, onTimeline, onDocument, onDelete, onArchive, onUnarchive,
}: Readonly<RowActionsProps>) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const run = (fn: () => void) => { setOpen(false); fn(); };

  return (
    <>
      <button
        type="button"
        className="action-btn document"
        title="研究日志"
        onClick={() => onDocument(stock)}
      >📄</button>
      <button
        type="button"
        className="action-btn"
        title="设置分类"
        onClick={() => onAssign(stock)}
      >🏷️</button>
      <button
        ref={btnRef}
        type="button"
        className={`action-btn${open ? ' active' : ''}`}
        title="更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >⋯</button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="row-actions-menu"
          role="menu"
          style={{ top: pos.top, right: pos.right }}
        >
          <button type="button" className="row-menu-item" role="menuitem" onClick={() => run(() => onTimeline(stock))}>
            <span className="row-menu-icon">⏱️</span>查看时间线
          </button>
          {archivedView ? (
            <button type="button" className="row-menu-item" role="menuitem" onClick={() => run(() => onUnarchive?.(stock))}>
              <span className="row-menu-icon">♻️</span>恢复（取消归档）
            </button>
          ) : (
            <button type="button" className="row-menu-item" role="menuitem" onClick={() => run(() => onArchive?.(stock))}>
              <span className="row-menu-icon">📥</span>归档
            </button>
          )}
          <button type="button" className="row-menu-item danger" role="menuitem" onClick={() => run(() => onDelete(stock))}>
            <span className="row-menu-icon">🗑️</span>删除
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}

interface StockTableProps {
  stocks: Stock[];
  onOpenProfile: (stock: Stock) => void;
  onEditBasicInfo: (stock: Stock) => void;
  onSetResearchValue: (stock: Stock, newVal: number) => void;
  onAssign: (stock: Stock) => void;
  onTimeline: (stock: Stock) => void;
  onDocument: (stock: Stock) => void;
  onDelete: (stock: Stock) => void;
  onArchive?: (stock: Stock) => void;
  onUnarchive?: (stock: Stock) => void;
  archivedView?: boolean;
}

export function StockTable({
  stocks, onOpenProfile, onEditBasicInfo, onSetResearchValue,
  onAssign, onTimeline, onDocument, onDelete, onArchive, onUnarchive,
  archivedView = false,
}: Readonly<StockTableProps>) {
  if (stocks.length === 0) {
    return (
      <div className="empty-state">
        <p>{archivedView ? '归档区暂无股票' : '暂无股票数据'}</p>
        {!archivedView && <p className="empty-sub">点击"添加股票"开始</p>}
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
              <RowActions
                stock={stock}
                archivedView={archivedView}
                onAssign={onAssign}
                onTimeline={onTimeline}
                onDocument={onDocument}
                onDelete={onDelete}
                onArchive={onArchive}
                onUnarchive={onUnarchive}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
