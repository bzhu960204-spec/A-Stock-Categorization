// ── Markdown cards (rich paste) ──────────────────────────────────────────────
// AI chat UIs render a ```markdown fence as a "Markdown" card. The clipboard HTML
// carries it as a bare base64 screenshot `<img>`, and the plain-text flavor has
// the card's raw Markdown with NO fence, sitting between the surrounding prose.
// So locate each image in the plain text via the HTML text just before/after it,
// and take what lies between those anchors as the card's source.
const ANCHOR_LEN = 24;
// Ignored when aligning HTML text with plain text (Markdown syntax differs).
const ALIGN_NOISE = /[\s*_`~#>-]/;

/** Drop noise chars, keeping each kept char's index in the original string. */
function flattenForAlign(s: string): { text: string; idx: number[] } {
  let text = '';
  const idx: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    if (ALIGN_NOISE.test(s[i])) continue;
    text += s[i];
    idx.push(i);
  }
  return { text, idx };
}

/**
 * Tag each `data:image` <img> that is a Markdown card screenshot with its source
 * (`data-markdown-source`, URI-encoded), taken from the plain text. The "Convert
 * images to Markdown" menu action turns tagged images into code blocks on demand.
 * Images with nothing between their anchors (real screenshots) or unfindable
 * anchors stay untagged; returns `html` unchanged when no card was recovered.
 */
export function tagMarkdownCards(html: string, plain: string): string {
  if (!html || !plain || !/<img\b[^>]*\bsrc\s*=\s*["']data:image\//i.test(html)) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imgs = Array.from(doc.querySelectorAll('img')).filter((img) =>
    /^data:image\//i.test(img.getAttribute('src') ?? ''),
  );
  if (!imgs.length) return html;

  const MARK = '\uE000';
  const markers = imgs.map((img) => {
    const t = doc.createTextNode(MARK);
    img.before(t);
    return t;
  });
  const segs = (doc.body.textContent ?? '').split(MARK);
  const flat = flattenForAlign(plain);

  let cursor = 0;
  const bodies = markers.map((_, k) => {
    const before = flattenForAlign(segs[k] ?? '').text.slice(-ANCHOR_LEN);
    const after = flattenForAlign(segs[k + 1] ?? '').text.slice(0, ANCHOR_LEN);

    let startFlat = cursor;
    if (before) {
      const i = flat.text.indexOf(before, cursor);
      if (i < 0) return null;
      startFlat = i + before.length;
    }
    let endFlat = flat.text.length;
    if (after) {
      const j = flat.text.indexOf(after, startFlat);
      if (j < 0) return null;
      endFlat = j;
    }

    const start = startFlat === 0 ? 0 : flat.idx[startFlat - 1] + 1;
    const end = endFlat >= flat.text.length ? plain.length : flat.idx[endFlat];
    // Strip blank edge lines but keep the first line's own indentation.
    const body = plain.slice(start, end).replace(/^\s*\n/, '').trimEnd();
    if (!body.trim()) return null;
    cursor = endFlat;
    return body;
  });

  if (!bodies.some((b) => b !== null)) return html;

  markers.forEach((t, k) => {
    const body = bodies[k];
    if (body != null) imgs[k].setAttribute('data-markdown-source', encodeURIComponent(body));
    t.remove();
  });
  return doc.body.innerHTML;
}
