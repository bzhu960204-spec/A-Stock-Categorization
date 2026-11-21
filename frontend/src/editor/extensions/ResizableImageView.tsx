import { useCallback, useRef } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

export function ResizableImageView({ node, updateAttributes, editor }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef({ startX: 0, startW: 0 });

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current.startX = e.clientX;
    drag.current.startW = imgRef.current?.offsetWidth ?? (node.attrs.width ?? 300);

    const onMove = (mv: MouseEvent) => {
      const newW = Math.max(50, Math.round(drag.current.startW + mv.clientX - drag.current.startX));
      updateAttributes({ width: newW });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [updateAttributes, node.attrs.width]);

  const isEditable: boolean = editor?.isEditable ?? false;
  const w: number | null = node.attrs.width ?? null;

  return (
    <NodeViewWrapper as="div" className="doc-img-wrap" contentEditable={false}>
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt ?? ''}
        title={node.attrs.title ?? undefined}
        style={w ? { width: `${w}px`, maxWidth: '100%' } : { maxWidth: '100%' }}
      />
      {isEditable && (
        <div className="doc-img-resize-handle" onMouseDown={onResizeMouseDown} />
      )}
    </NodeViewWrapper>
  );
}
