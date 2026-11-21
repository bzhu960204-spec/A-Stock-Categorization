// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { dataUrlToFile, imageFilesFrom, replaceDataImages } from './imageUpload';

const PNG = `data:image/png;base64,${btoa('\x89PNG')}`;

describe('dataUrlToFile', () => {
  it('decodes the payload and keeps the mime type', async () => {
    const file = dataUrlToFile(PNG)!;
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('image.png');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it('rejects non-image or malformed URLs', () => {
    expect(dataUrlToFile('data:text/plain;base64,aGk=')).toBeNull();
    expect(dataUrlToFile('/api/images/1')).toBeNull();
    expect(dataUrlToFile('data:image/png;base64,!!!')).toBeNull();
  });
});

describe('replaceDataImages', () => {
  it('uploads each distinct inline image once and rewrites every src', async () => {
    const upload = vi.fn().mockResolvedValue('/api/images/7');
    const { html, failed } = await replaceDataImages(
      `<p>a</p><img src="${PNG}" width="200"><img src="${PNG}"><img src="/api/images/1">`,
      upload,
    );
    expect(upload).toHaveBeenCalledTimes(1);
    expect(failed).toBe(0);
    expect(html).toBe('<p>a</p><img src="/api/images/7" width="200"><img src="/api/images/7"><img src="/api/images/1">');
  });

  it('keeps the data URL and reports failures when an upload fails', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('offline'));
    const { html, failed } = await replaceDataImages(`<img src="${PNG}">`, upload);
    expect(failed).toBe(1);
    expect(html).toContain(PNG);
  });

  it('returns content without inline images untouched', async () => {
    const upload = vi.fn();
    const input = '<p>plain &amp; simple</p>';
    expect(await replaceDataImages(input, upload)).toEqual({ html: input, failed: 0 });
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('imageFilesFrom', () => {
  it('returns only image files', () => {
    const img = new File(['x'], 'a.png', { type: 'image/png' });
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' });
    const data = { files: [img, txt], items: [] } as unknown as DataTransfer;
    expect(imageFilesFrom(data)).toEqual([img]);
    expect(imageFilesFrom(null)).toEqual([]);
  });

  it('falls back to clipboard items when files is empty', () => {
    const img = new File(['x'], 'shot.png', { type: 'image/png' });
    const data = {
      files: [],
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => img },
      ],
    } as unknown as DataTransfer;
    expect(imageFilesFrom(data)).toEqual([img]);
  });
});
