import { ReactNodeViewRenderer } from '@tiptap/react';
import Image from '@tiptap/extension-image';
import { ResizableImageView } from './ResizableImageView';

/**
 * Block image with a draggable pixel `width`. Also keeps the Markdown source of
 * pasted AI "Markdown card" screenshots (see tagMarkdownCards), so the "…" menu
 * can turn them back into code blocks.
 */
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // URI-encoded so no raw `<`/`>` ends up in the stored HTML.
      markdownSource: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-markdown-source');
          if (!raw) return null;
          try {
            return decodeURIComponent(raw);
          } catch {
            return null;
          }
        },
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.markdownSource
            ? { 'data-markdown-source': encodeURIComponent(String(attrs.markdownSource)) }
            : {},
      },
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('width') || el.style.width;
          if (!raw) return null;
          const n = parseInt(raw, 10);
          return isNaN(n) ? null : n;
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          if (!attrs.width) return {};
          return { width: String(attrs.width), style: `width:${attrs.width}px` };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
