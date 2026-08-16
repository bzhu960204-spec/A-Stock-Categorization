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
