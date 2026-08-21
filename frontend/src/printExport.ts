import { marked } from 'marked';
import { autoFenceBoxArt } from './markdownUtils';
import type { Stock, IndustryChain } from './api';

/** Build the standalone printable HTML document for a stock's industry chains. */
export function buildChainsPrintHtml(stock: Stock, chains: IndustryChain[]): string {
  const stockLabel = `${stock.name}（${stock.code}）`;
  const chainHtmlBlocks = chains.map(chain => {
    const md = autoFenceBoxArt(chain.content);
    const html = marked.parse(md) as string;
    return `<section class="chain-section">
  <h2 class="chain-title">${chain.title}</h2>
  <div class="chain-body">${html}</div>
</section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>${stockLabel} — 产业链</title>
<style>
  @page { size: A4; margin: 22mm 18mm; }
  * { box-sizing: border-box; overflow: visible; }
  body {
    font-family: 'PingFang SC', 'Microsoft YaHei', 'SimSun', sans-serif;
    font-size: 11pt;
    color: #1a1a1a;
    background: #fff;
    line-height: 1.7;
    overflow: visible;
  }
  .cover {
    margin-bottom: 32pt;
    border-bottom: 2px solid #333;
    padding-bottom: 12pt;
  }
  .cover h1 { font-size: 18pt; margin: 0 0 4pt; }
  .cover p  { font-size: 9pt; color: #555; margin: 0; }
  .chain-section { margin-bottom: 28pt; break-inside: avoid; }
  .chain-title {
    font-size: 13pt;
    font-weight: 700;
    border-left: 4px solid #333;
    padding-left: 8pt;
    margin: 0 0 10pt;
  }
  .chain-body { font-size: 10.5pt; }
  .chain-body pre {
    font-family: 'JetBrains Mono', 'Courier New', 'Courier', monospace;
    font-size: 8.5pt;
    background: #f6f6f6;
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 10pt 12pt;
    white-space: pre-wrap;
    word-break: break-all;
    overflow: visible;
    line-height: 1.35;
  }
  .chain-body code {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 8pt;
    background: #f0f0f0;
    padding: 1px 3px;
    border-radius: 2px;
  }
  .chain-body pre code { background: none; padding: 0; font-size: inherit; }
  .chain-body h1, .chain-body h2, .chain-body h3 { margin: 10pt 0 5pt; }
  .chain-body p  { margin: 0 0 7pt; }
  .chain-body ul, .chain-body ol { margin: 0 0 7pt; padding-left: 18pt; }
  .chain-body li { margin-bottom: 2pt; }
  hr { border: none; border-top: 1px solid #ccc; margin: 18pt 0; }
</style>
</head>
<body>
<div class="cover">
  <h1>${stockLabel} · 产业链整理</h1>
  <p>导出时间：${new Date().toLocaleString('zh-CN')} · 共 ${chains.length} 条业务线</p>
</div>
${chainHtmlBlocks}
</body>
</html>`;
}

/** Open a print window for a single rich-text document (report / idea / trade). */
export function printDocument(opts: {
  title: string;
  metaParts: (string | false | null | undefined)[];
  stars?: string;
  contentHtml?: string;
}): void {
  const meta = opts.metaParts.filter(Boolean).join('　|　');
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${opts.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "PingFang SC","Microsoft YaHei","SimSun",sans-serif; font-size: 14px; color: #1a1a1a; background: #fff; padding: 40px 48px; }
    .doc-title { font-size: 22px; font-weight: 700; line-height: 1.4; margin-bottom: 8px; }
    .doc-stars { font-size: 18px; color: #f5a623; letter-spacing: 2px; margin-bottom: 6px; }
    .doc-meta { font-size: 12px; color: #666; border-bottom: 1px solid #e0e0e0; padding-bottom: 10px; margin-bottom: 24px; }
    .doc-content { line-height: 1.8; }
    .doc-content p { margin-bottom: .8em; }
    .doc-content h1,.doc-content h2,.doc-content h3 { margin: 1em 0 .5em; font-weight: 600; }
    .doc-content ul,.doc-content ol { margin: .5em 0 .8em 1.5em; }
    .doc-content li { margin-bottom: .3em; }
    .doc-content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    .doc-content th,.doc-content td { border: 1px solid #ccc; padding: 6px 10px; font-size: 13px; }
    .doc-content th { background: #f5f5f5; font-weight: 600; }
    .doc-content blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #555; margin: .8em 0; }
    .doc-content strong { font-weight: 700; }
    .doc-content em { font-style: italic; }
    @media print { body { padding: 20px 28px; } @page { size: A4; margin: 20mm 18mm; } }
  </style>
</head>
<body>
  <div class="doc-title">${opts.title}</div>
  ${opts.stars ? `<div class="doc-stars">${opts.stars}</div>` : ''}
  <div class="doc-meta">${meta}</div>
  <div class="doc-content">${opts.contentHtml || '<p>（无内容）</p>'}</div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };<\/script>
</body>
</html>`;
  const win = window.open('', '_blank', 'width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); }
}
