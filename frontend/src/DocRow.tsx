import type { ReactNode } from 'react';

interface DocRowProps {
  /** Tag chips rendered before the title (category / sub-category / sector…). */
  tags?: ReactNode;
  title: ReactNode;
  preview?: ReactNode;
  rating?: number;
  /** When provided, stars are clickable; omit for a static (read-only) rating. */
  onRate?: (n: number) => void;
  date?: ReactNode;
  /** Action buttons rendered at the end of the row (edit / archive / delete…). */
  actions?: ReactNode;
  onClick?: () => void;
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

/** Shared list-row card used by the research / idea / trade document modules. */
export default function DocRow({
  tags, title, preview, rating, onRate, date, actions,
  onClick, draggable, dragging, onDragStart, onDragEnd,
}: Readonly<DocRowProps>) {
  return (
    <div
      className={`rp-row${dragging ? ' dragging' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <div className="rp-row-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {tags}
          <span className="rp-row-title">{title}</span>
        </div>
        {preview != null && preview !== '' && (
          <span className="rp-row-preview">{preview}</span>
        )}
      </div>
      <div className="rp-row-right">
        <div className="rp-row-stars" onClick={onRate ? e => e.stopPropagation() : undefined}>
          {[1, 2, 3, 4, 5].map(n => (
            <span
              key={n}
              className={`star-btn${(rating ?? 0) >= n ? ' filled' : ''}`}
              onClick={onRate ? () => onRate(n) : undefined}
              title={onRate ? `设为 ${n} 星` : undefined}
            >
              {(rating ?? 0) >= n ? '★' : '☆'}
            </span>
          ))}
        </div>
        {date != null && <span className="rp-row-date">{date}</span>}
        {actions}
      </div>
    </div>
  );
}
