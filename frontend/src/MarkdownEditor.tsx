import { useEffect, useRef } from 'react';

interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
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

  const btn = (label: string, action: () => void, title: string) => (
    <button
      type="button"
      className="md-tb-btn"
      onMouseDown={e => { e.preventDefault(); action(); }}
      title={title}
    >{label}</button>
  );

  return (
    <div className="md-editor-wrap">
      <div className="md-toolbar">
        {btn('B', () => wrapSelection('**'), '加粗')}
        {btn('I', () => wrapSelection('*'), '斜体')}
        {btn('S', () => wrapSelection('~~'), '删除线')}
        <span className="md-tb-sep" />
        {btn('H1', () => insertLinePrefix('# '), '一级标题')}
        {btn('H2', () => insertLinePrefix('## '), '二级标题')}
        {btn('H3', () => insertLinePrefix('### '), '三级标题')}
        <span className="md-tb-sep" />
        {btn('•', () => insertLinePrefix('- '), '无序列表')}
        {btn('1.', () => insertLinePrefix('1. '), '有序列表')}
        {btn('❝', () => insertLinePrefix('> '), '引用')}
        {btn('`', () => wrapSelection('`'), '行内代码')}
        {btn('```', () => insertBlock('```\n\n```'), '代码块')}
        <span className="md-tb-sep" />
        {btn('—', () => insertBlock('---'), '分割线')}
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
