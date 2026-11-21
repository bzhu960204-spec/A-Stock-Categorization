import { uploadDocImage } from '../api';

export type ImageUploader = (file: File) => Promise<string>;

/** Image files from a paste / drop (other files and text items are ignored). */
export function imageFilesFrom(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const fromFiles = Array.from(data.files ?? []).filter(f => f.type.startsWith('image/'));
  if (fromFiles.length > 0) return fromFiles;
  // Some browsers expose pasted screenshots only through `items`.
  return Array.from(data.items ?? [])
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((f): f is File => f != null);
}

/** Decodes a `data:image/...;base64,...` URL into a File (null if it isn't one). */
export function dataUrlToFile(dataUrl: string, name = 'image'): File | null {
  const match = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(dataUrl.trim());
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ext = match[1].split('/')[1]?.replace(/\+.*$/, '') || 'png';
    return new File([bytes], `${name}.${ext}`, { type: match[1] });
  } catch {
    return null;
  }
}

/**
 * Uploads every inline base64 image in `html` and rewrites its `src` to the
 * returned URL, so stored content only references `/api/images/{id}`.
 * Images that fail to upload keep their data URL (nothing is lost).
 */
export async function replaceDataImages(
  html: string,
  upload: ImageUploader = uploadDocImage,
): Promise<{ html: string; failed: number }> {
  if (!html.includes('data:image/')) return { html, failed: 0 };
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const uploaded = new Map<string, string>();
  let failed = 0;
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img[src^="data:image/"]'))) {
    const src = img.getAttribute('src')!;
    let url = uploaded.get(src);
    if (!url) {
      const file = dataUrlToFile(src);
      try {
        if (!file) throw new Error('invalid data URL');
        url = await upload(file);
        uploaded.set(src, url);
      } catch {
        failed++;
        continue;
      }
    }
    img.setAttribute('src', url);
  }
  return { html: doc.body.innerHTML, failed };
}
