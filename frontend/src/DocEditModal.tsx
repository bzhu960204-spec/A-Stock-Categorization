import type { ReactNode, Ref } from 'react';
import { DocEditor, type DocEditorHandle } from './DocEditor';

interface DocEditModalProps {
  titleValue: string;
  onTitleChange: (v: string) => void;
  titlePlaceholder: string;
  /** Meta inputs (category / sub-category / source / sector…) rendered under the title. */
  metaFields?: ReactNode;
  /** When provided, an inline star rating is shown after the meta fields. */
  rating?: number;
  onRatingChange?: (n: number) => void;

  content: string;
  onContentChange: (html: string) => void;
  editorRef?: Ref<DocEditorHandle>;

  saveLabel: string;
  saving: boolean;
  saveError?: string;
  onSave: () => void;
  onCancel: () => void;
  onClose: () => void;
  /** When provided, a danger-styled delete button is shown. */
  onDelete?: () => void;

  /** Extra content rendered after the editor (e.g. attachments section). */
  bodyExtra?: ReactNode;
}

/** Shared edit-modal shell wrapping the rich DocEditor for the document modules. */
export default function DocEditModal({
  titleValue, onTitleChange, titlePlaceholder,
  metaFields, rating, onRatingChange,
  content, onContentChange, editorRef,
  saveLabel, saving, saveError,
  onSave, onCancel, onClose, onDelete, bodyExtra,
}: Readonly<DocEditModalProps>) {
  return (
    <div className="rp-modal-overlay">
      <div className="rp-modal" onClick={e => e.stopPropagation()}>
        <div className="rp-modal-header">
          <div className="rp-modal-header-left rp-modal-edit-meta">
            <input
              className="rp-modal-title-input"
              placeholder={titlePlaceholder}
              value={titleValue}
              onChange={e => onTitleChange(e.target.value)}
              autoFocus
            />
            <div className="rp-modal-meta-inputs">
              {metaFields}
              {onRatingChange && (
                <div className="star-rating-inline">
                  {[1, 2, 3, 4, 5].map(n => (
                    <span
                      key={n}
                      className={`star-btn${(rating ?? 0) >= n ? ' filled' : ''}`}
                      onClick={() => onRatingChange((rating ?? 0) === n ? 0 : n)}
                      title={`评为 ${n} 星`}
                    >
                      {(rating ?? 0) >= n ? '★' : '☆'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="rp-modal-header-right">
            {saveError && <span className="doc-save-error">{saveError}</span>}
            {onDelete && (
              <button className="cancel-btn" style={{ color: 'var(--danger)' }}
                onClick={onDelete} disabled={saving}>删除</button>
            )}
            <button className="cancel-btn" onClick={onCancel} disabled={saving}>取消</button>
            <button className="confirm-btn" onClick={onSave} disabled={saving}>
              {saving ? '保存中…' : saveLabel}
            </button>
            <button className="icon-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="rp-modal-body">
          <div className="rp-modal-editor-wrap">
            <DocEditor
              ref={editorRef}
              value={content}
              onChange={onContentChange}
            />
          </div>
          {bodyExtra}
        </div>
      </div>
    </div>
  );
}
