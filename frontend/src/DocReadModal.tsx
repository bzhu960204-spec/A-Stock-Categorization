import type { ReactNode } from 'react';
import { DocEditor } from './DocEditor';
import { useEscapeKey } from './useEscapeKey';

interface DocReadModalProps {
  title: ReactNode;
  /** Chip shown before the title (category / sector name). */
  categoryTag?: ReactNode;
  /** Tags/date shown in the meta row after the star rating. */
  metaTags?: ReactNode;
  rating?: number;
  /** When provided, stars are clickable; omit for a static rating. */
  onRate?: (n: number) => void;

  content: string;

  onExportPdf?: () => void;
  onEdit?: () => void;
  /** Extra header buttons injected before the close button (e.g. archive/unarchive). */
  headerExtra?: ReactNode;
  onClose: () => void;

  /** Extra content rendered after the read-only editor (attachments / comments). */
  bodyExtra?: ReactNode;
  /** Wrap the body in a scroll container (needed when bodyExtra is present). */
  scrollBody?: boolean;
}

/** Shared read-only view modal for the research / idea / trade document modules. */
export default function DocReadModal({
  title, categoryTag, metaTags, rating, onRate, content,
  onExportPdf, onEdit, headerExtra, onClose, bodyExtra, scrollBody,
}: Readonly<DocReadModalProps>) {
  useEscapeKey(onClose);

  const readContent = (
    <div className="rp-modal-read-content doc-read-view">
      <DocEditor value={content || ''} onChange={() => {}} readonly />
    </div>
  );

  return (
    <div className="rp-modal-overlay" onClick={onClose}>
      <div className="rp-modal" onClick={e => e.stopPropagation()}>
        <div className="rp-modal-header">
          <div className="rp-modal-header-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {categoryTag}
              <span className="rp-modal-title-display">{title}</span>
            </div>
            <div className="rp-modal-meta">
              <div className="star-rating-inline" onClick={e => e.stopPropagation()}>
                {[1, 2, 3, 4, 5].map(n => (
                  <span
                    key={n}
                    className={`star-btn${(rating ?? 0) >= n ? ' filled' : ''}`}
                    onClick={onRate ? () => onRate(n) : undefined}
                    title={onRate ? `设为 ${n} 星` : undefined}
                    style={onRate ? undefined : { cursor: 'default' }}
                  >
                    {(rating ?? 0) >= n ? '★' : '☆'}
                  </span>
                ))}
              </div>
              {metaTags}
            </div>
          </div>
          <div className="rp-modal-header-right">
            {onExportPdf && <button className="icon-btn" onClick={onExportPdf} title="导出为 PDF">⬇ 导出PDF</button>}
            {onEdit && <button className="icon-btn" onClick={onEdit}>✎ 编辑</button>}
            {headerExtra}
            <button className="icon-btn" onClick={onClose}>✕ 关闭</button>
          </div>
        </div>

        <div className="rp-modal-body">
          {scrollBody ? (
            <div className="rp-modal-read-scroll">
              {readContent}
              {bodyExtra}
            </div>
          ) : (
            <>
              {readContent}
              {bodyExtra}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
