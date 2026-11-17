import { useEffect, useRef } from 'react';

interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

interface ToolbarButtonProps {
  label: string;
  title: string;
  onAction: () => void;
}

function ToolbarButton({ label, title, onAction }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className="md-tb-btn"
      onMouseDown={e => { e.preventDefault(); onAction(); }}
      title={title}
    >{label}</button>
  );
}

export function MarkdownEditor({ value, onChange, placeholder }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(el.scrollHeight, 140)}px`;
  }, [value]);

  const wrapSelection = (before: string, after: string = before) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newVal);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length);
    });
  };

  const insertLinePrefix = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const newVal = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(newVal);
    requestAnimationFrame(() => {
      el.focus();
      const newPos = start + prefix.length;
      el.setSelectionRange(newPos, newPos);
    });
  };

  const insertBlock = (text: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const before = start > 0 && value[start - 1] !== '\n' ? '\n\n' : '';
    const newVal = value.slice(0, start) + before + text + '\n\n' + value.slice(start);
    onChange(newVal);
    const insertOffset = start + before.length + text.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(insertOffset, insertOffset);
    });
  };

  return (
    <div className="md-editor-wrap">
      <div className="md-toolbar">
        <ToolbarButton label="B" title="加粗" onAction={() => wrapSelection('**')} />
        <ToolbarButton label="I" title="斜体" onAction={() => wrapSelection('*')} />
        <ToolbarButton label="S" title="删除线" onAction={() => wrapSelection('~~')} />
        <span className="md-tb-sep" />
        <ToolbarButton label="H1" title="一级标题" onAction={() => insertLinePrefix('# ')} />
        <ToolbarButton label="H2" title="二级标题" onAction={() => insertLinePrefix('## ')} />
        <ToolbarButton label="H3" title="三级标题" onAction={() => insertLinePrefix('### ')} />
        <span className="md-tb-sep" />
        <ToolbarButton label="•" title="无序列表" onAction={() => insertLinePrefix('- ')} />
        <ToolbarButton label="1." title="有序列表" onAction={() => insertLinePrefix('1. ')} />
        <ToolbarButton label="❝" title="引用" onAction={() => insertLinePrefix('> ')} />
        <ToolbarButton label="`" title="行内代码" onAction={() => wrapSelection('`')} />
        <ToolbarButton label="```" title="代码块" onAction={() => insertBlock('```\n\n```')} />
        <span className="md-tb-sep" />
        <ToolbarButton label="—" title="分割线" onAction={() => insertBlock('---')} />
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="profile-textarea md-textarea"
        spellCheck={false}
      />
    </div>
  );
}
