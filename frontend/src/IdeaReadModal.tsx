import { useState, type ReactNode } from 'react';
import DocReadModal from './DocReadModal';
import { printDocument } from './printExport';
import { getIdeaAttachmentDownloadUrl, type Idea, type IdeaAttachment, type IdeaComment } from './api';

interface IdeaReadModalProps {
  idea: Idea;
  attachments: IdeaAttachment[];
  comments: IdeaComment[];
  onClose: () => void;
  /** When provided, stars are clickable. Omit for a static (read-only) rating. */
  onRate?: (n: number) => void;
  /** When provided, shows an edit button. Omit in read-only contexts (e.g. archive). */
  onEdit?: () => void;
  /** Extra header buttons injected before the close button (e.g. archive/unarchive). */
  headerExtra?: ReactNode;
  /** When true, comments are read-only (no input, no edit/delete). */
  readOnly?: boolean;
  onAddComment?: (content: string) => Promise<void> | void;
  onUpdateComment?: (id: number, content: string) => Promise<void> | void;
  onDeleteComment?: (id: number) => Promise<void> | void;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

/** Shared read view for an idea; interactivity is opt-in via props so it can render
 *  read-only (archive center) or interactive (idea module read mode). */
export function IdeaReadModal({
  idea, attachments, comments, onClose, onRate, onEdit, headerExtra,
  readOnly = false, onAddComment, onUpdateComment, onDeleteComment,
}: Readonly<IdeaReadModalProps>) {
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const canComment = !readOnly && !!onAddComment;

  const handleExportPdf = () => {
    printDocument({
      title: idea.title,
      metaParts: [
        idea.categoryName ? `分类：${idea.categoryName}` : '',
        idea.rating > 0 ? `评星：${'★'.repeat(idea.rating)}${'☆'.repeat(5 - idea.rating)}` : '',
        idea.createdAt ? `录入日期：${new Date(idea.createdAt).toLocaleDateString('zh-CN')}` : '',
      ],
      contentHtml: idea.content,
    });
  };

  const submitComment = async () => {
    if (!onAddComment || !newComment.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(newComment.trim());
      setNewComment('');
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async (id: number) => {
    if (!onUpdateComment || !editingContent.trim()) return;
    await onUpdateComment(id, editingContent.trim());
    setEditingId(null);
    setEditingContent('');
  };

  const bodyExtra = (
    <>
      {attachments.length > 0 && (
        <div className="idea-attachments-section">
          <div className="idea-attachments-header">
            <span className="idea-attachments-title">📎 附件 ({attachments.length})</span>
          </div>
          <div className="idea-attachments-list">
            {attachments.map(att => (
              <div key={att.id} className="idea-attachment-item">
                <a
                  href={getIdeaAttachmentDownloadUrl(att.ideaId, att.id)}
                  className="idea-attachment-link"
                  download={att.fileName}
                  title={`下载 ${att.fileName}`}
                >
                  <span className="idea-attachment-icon">📄</span>
                  <span className="idea-attachment-name">{att.fileName}</span>
                  <span className="idea-attachment-size">{formatFileSize(att.fileSize)}</span>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="idea-comments-section">
        <div className="idea-comments-header">
          <span className="idea-comments-title">💬 评论{comments.length > 0 ? ` (${comments.length})` : ''}</span>
        </div>

        {comments.length > 0 && (
          <div className="idea-comments-list">
            {comments.map(comment => (
              <div key={comment.id} className="idea-comment-item">
                {editingId === comment.id ? (
                  <div className="idea-comment-edit-wrap">
                    <textarea
                      className="idea-comment-edit-textarea"
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                      autoFocus
                    />
                    <div className="idea-comment-edit-actions">
                      <button className="small-btn" onClick={() => submitEdit(comment.id)}>保存</button>
                      <button className="small-btn" onClick={() => { setEditingId(null); setEditingContent(''); }}>取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="idea-comment-content">{comment.content}</div>
                    <div className="idea-comment-meta">
                      <span className="idea-comment-time">
                        {new Date(comment.createdAt).toLocaleString('zh-CN')}
                        {comment.updatedAt !== comment.createdAt && ' (已编辑)'}
                      </span>
                      {!readOnly && (onUpdateComment || onDeleteComment) && (
                        <div className="idea-comment-actions">
                          {onUpdateComment && (
                            <button
                              className="idea-comment-action-btn"
                              title="编辑"
                              onClick={() => { setEditingId(comment.id); setEditingContent(comment.content); }}
                            >✎</button>
                          )}
                          {onDeleteComment && (
                            <button
                              className="idea-comment-action-btn danger"
                              title="删除"
                              onClick={() => onDeleteComment(comment.id)}
                            >✕</button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {canComment && (
          <div className="idea-comment-input-wrap">
            <textarea
              className="idea-comment-textarea"
              placeholder="写下你的评论…"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment();
              }}
              rows={2}
            />
            <button
              className="idea-comment-submit-btn"
              onClick={submitComment}
              disabled={submitting || !newComment.trim()}
            >
              {submitting ? '发送中…' : '发送'}
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <DocReadModal
      title={idea.title}
      categoryTag={idea.categoryName ? <span className="rp-global-sector-tag">{idea.categoryName}</span> : undefined}
      rating={idea.rating}
      onRate={onRate}
      metaTags={<>
        {idea.subCategory && <span className="research-meta-tag">{idea.subCategory}</span>}
        {idea.createdAt && (
          <span className="research-meta-date">{new Date(idea.createdAt).toLocaleDateString('zh-CN')}</span>
        )}
      </>}
      content={idea.content || ''}
      onExportPdf={handleExportPdf}
      onEdit={onEdit}
      headerExtra={headerExtra}
      onClose={onClose}
      bodyExtra={bodyExtra}
      scrollBody
    />
  );
}
