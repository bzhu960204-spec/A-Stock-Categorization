import type { ReactNode } from 'react';

interface DocListToolbarProps {
  title: ReactNode;
  count: ReactNode;
  /** Right-aligned action buttons (new / archive toggle…). */
  children?: ReactNode;
}

/** Shared list toolbar (title + count + right-aligned actions) for the document modules. */
export default function DocListToolbar({ title, count, children }: Readonly<DocListToolbarProps>) {
  return (
    <div className="rp-toolbar">
      <span className="rp-toolbar-title">{title}</span>
      <span className="rp-toolbar-count">{count}</span>
      <div style={{ flex: 1 }} />
      {children}
    </div>
  );
}
