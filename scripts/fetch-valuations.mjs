#!/usr/bin/env node
/**
 * 估值数据拉取脚本
 * 
 * 使用 Financial Modeling Prep (FMP) API 拉取公司估值数据，
 * 输出符合应用导入格式的 JSON 文件。
 *
 * 用法:
 *   node scripts/fetch-valuations.mjs AAPL MSFT GOOGL
 *   node scripts/fetch-valuations.mjs AAPL --key YOUR_FMP_KEY
 *   node scripts/fetch-valuations.mjs --tickers AAPL,MSFT,GOOGL
 *
 * API Key 配置（优先级从高到低）:
 *   1. 命令行参数 --key YOUR_KEY
 *   2. 环境变量 FMP_API_KEY
 *   3. 项目根目录 .env 文件中的 FMP_API_KEY=xxx
 *
 * 免费申请 FMP API Key: https://financialmodelingprep.com/developer/docs/
 * 免费额度: 250次/天
 *
 * 输出:
 *   ./valuation-import-YYYY-MM-DD.json（可直接粘贴到应用的导入框）
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── 解析参数 ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let key = null;
  const tickers = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--key' && args[i + 1]) {
      key = args[++i];
    } else if (args[i] === '--tickers' && args[i + 1]) {
      tickers.push(...args[++i].split(',').map(t => t.trim().toUpperCase()));
    } else if (!args[i].startsWith('--')) {
      tickers.push(args[i].toUpperCase());
    }
  }

  return { key, tickers };
}

// ── 读取 API Key ─────────────────────────────────────────────────────────

function getApiKey(cliKey) {
  if (cliKey) return cliKey;
  if (process.env.FMP_API_KEY) return process.env.FMP_API_KEY;

  // 尝试读取 .env 文件
  const envPath = resolve(ROOT, '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    const match = content.match(/^FMP_API_KEY\s*=\s*(.+)$/m);
    if (match) return match[1].trim();
  }
  return null;
}

// ── FMP API 请求 ─────────────────────────────────────────────────────────

const BASE = 'https://financialmodelingprep.com/api/v3';

async function fmpGet(path, apiKey) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE}${path}${sep}apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMP API error ${res.status}: ${path}`);
  return res.json();
}

// ── 拉取单只股票数据 ─────────────────────────────────────────────────────

async function fetchTicker(ticker, apiKey) {
  console.log(`  ⏳ ${ticker} — 拉取中...`);

  const [profile, keyMetricsTTM, incomeQtr, keyMetricsAnnual, analystEst] = await Promise.all([
    fmpGet(`/profile/${ticker}`, apiKey),
    fmpGet(`/key-metrics-ttm/${ticker}`, apiKey),
    fmpGet(`/income-statement/${ticker}?period=quarter&limit=4`, apiKey),
    fmpGet(`/key-metrics/${ticker}?period=annual&limit=4`, apiKey),
    fmpGet(`/analyst-estimates/${ticker}?limit=4`, apiKey).catch(() => []),
  ]);

  if (!profile?.length) {
    console.log(`  ❌ ${ticker} — 未找到，跳过`);
    return null;
  }

  const p = profile[0];
  const km = keyMetricsTTM?.[0] ?? {};

  // ── 基础倍数 ──
  const pe = km.peRatioTTM ?? null;
  const ps = km.priceToSalesRatioTTM ?? null;

  // ── FCF Multiple = Price / FCF per share，即 pfcfRatio ──
  const fcfMultiple = km.pfcfRatioTTM ?? null;

  // ── NTM PE / NTM PS（从分析师预期计算）──
  let ntmPe = null;
  let ntmPs = null;
  let fwdFcfMultiple = null;

  if (analystEst?.length >= 4) {
    // 未来4个季度预期汇总
    const ntmRevenue = analystEst.slice(0, 4).reduce((sum, q) => sum + (q.estimatedRevenueAvg || 0), 0);
    const ntmEps = analystEst.slice(0, 4).reduce((sum, q) => sum + (q.estimatedEpsAvg || 0), 0);

    if (ntmEps > 0 && p.price) {
      ntmPe = round(p.price / ntmEps);
    }
    if (ntmRevenue > 0 && p.mktCap) {
      ntmPs = round(p.mktCap / ntmRevenue);
    }
  }

  // ── 季度毛利率 / 净利率（小数形式） ──
  // incomeQtr[0] = 最新季度 → Q4, incomeQtr[3] = 最早 → Q1
  const margins = { grossMarginQ1: null, grossMarginQ2: null, grossMarginQ3: null, grossMarginQ4: null,
                    netMarginQ1: null, netMarginQ2: null, netMarginQ3: null, netMarginQ4: null };

  if (incomeQtr?.length >= 4) {
    for (let i = 0; i < 4; i++) {
      const q = incomeQtr[i];
      const qIdx = 4 - i; // 0→Q4, 1→Q3, 2→Q2, 3→Q1
      if (q.revenue && q.revenue !== 0) {
        margins[`grossMarginQ${qIdx}`] = round(q.grossProfit / q.revenue, 4);
        margins[`netMarginQ${qIdx}`] = round(q.netIncome / q.revenue, 4);
      }
    }
  }

  // 整体毛利率/净利率取最新季度值（也可以是 TTM）
  const grossMargin = margins.grossMarginQ4;
  const netMargin = margins.netMarginQ4;

  // Non-GAAP 净利率 — FMP 无直接数据，留 null
  const nonGaapNetMargin = null;

  // ── TTM ROIC（近4年）──
  // keyMetricsAnnual[0] = 最新年 → Y4, [3] = 最早 → Y1
  const roic = { ttmRoicY1: null, ttmRoicY2: null, ttmRoicY3: null, ttmRoicY4: null };
  if (keyMetricsAnnual?.length >= 4) {
    for (let i = 0; i < 4; i++) {
      const yIdx = 4 - i; // 0→Y4, 1→Y3, 2→Y2, 3→Y1
      const val = keyMetricsAnnual[i]?.roic;
      if (val != null) roic[`ttmRoicY${yIdx}`] = round(val, 4);
    }
  } else if (keyMetricsAnnual?.length > 0) {
    // 有多少填多少
    for (let i = 0; i < keyMetricsAnnual.length; i++) {
      const yIdx = keyMetricsAnnual.length - i;
      const val = keyMetricsAnnual[i]?.roic;
      if (val != null) roic[`ttmRoicY${yIdx + (4 - keyMetricsAnnual.length)}`] = round(val, 4);
    }
  }

  const result = {
    ticker,
    companyName: p.companyName || ticker,
    snapshotDate: new Date().toISOString().slice(0, 10),
    pe: round(pe),
    ps: round(ps),
    ntmPe: round(ntmPe),
    ntmPs: round(ntmPs),
    fcfMultiple: round(fcfMultiple),
    fwdFcfMultiple: round(fwdFcfMultiple),  // 暂无数据源，留 null
    grossMargin,
    ...margins,
    netMargin,
    nonGaapNetMargin,
    ...roic,
    notes: `自动拉取 @ ${new Date().toISOString().slice(0, 10)}`,
  };

  console.log(`  ✅ ${ticker} — ${p.companyName} (PE=${fmtV(pe)}, PS=${fmtV(ps)}, ROIC=${fmtPct(roic.ttmRoicY4)})`);
  return result;
}

// ── 工具函数 ─────────────────────────────────────────────────────────────

function round(v, decimals = 2) {
  if (v == null || isNaN(v)) return null;
  const factor = 10 ** decimals;
  return Math.round(v * factor) / factor;
}

function fmtV(v) {
  return v != null ? v.toFixed(1) : 'N/A';
}

function fmtPct(v) {
  return v != null ? (v * 100).toFixed(1) + '%' : 'N/A';
}

// ── 主流程 ───────────────────────────────────────────────────────────────

async function main() {
  const { key: cliKey, tickers } = parseArgs();

  if (tickers.length === 0) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  估值数据拉取工具 (Financial Modeling Prep)                  ║
╚══════════════════════════════════════════════════════════════╝

用法:
  node scripts/fetch-valuations.mjs AAPL MSFT GOOGL
  node scripts/fetch-valuations.mjs AAPL --key YOUR_FMP_KEY
  node scripts/fetch-valuations.mjs --tickers AAPL,MSFT,GOOGL

API Key 配置:
  1. 命令行: --key YOUR_KEY
  2. 环境变量: set FMP_API_KEY=YOUR_KEY
  3. 项目根目录 .env 文件: FMP_API_KEY=YOUR_KEY

免费注册: https://financialmodelingprep.com/developer/docs/
`);
    process.exit(0);
  }

  const apiKey = getApiKey(cliKey);
  if (!apiKey) {
    console.error('❌ 未找到 FMP API Key。请通过 --key 参数、FMP_API_KEY 环境变量或 .env 文件配置。');
    console.error('   免费注册: https://financialmodelingprep.com/developer/docs/');
    process.exit(1);
  }

  console.log(`\n📊 开始拉取 ${tickers.length} 只股票的估值数据...\n`);

  const results = [];
  for (const ticker of tickers) {
    try {
      const data = await fetchTicker(ticker, apiKey);
      if (data) results.push(data);
    } catch (err) {
      console.log(`  ❌ ${ticker} — 拉取失败: ${err.message}`);
    }
    // 避免触发 rate limit
    if (tickers.length > 5) await new Promise(r => setTimeout(r, 300));
  }

  if (results.length === 0) {
    console.log('\n⚠️  没有成功拉取到任何数据');
    process.exit(1);
  }

  // 输出文件
  const today = new Date().toISOString().slice(0, 10);
  const outPath = resolve(ROOT, `valuation-import-${today}.json`);
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ✅ 完成！成功拉取 ${String(results.length).padStart(2)} / ${String(tickers.length).padStart(2)} 只股票                        ║
╠══════════════════════════════════════════════════════════════╣
║  输出文件: ${outPath.length > 48 ? '...' + outPath.slice(-45) : outPath.padEnd(48)}║
║                                                              ║
║  使用方式:                                                   ║
║  → 打开估值比较模块 → 导入 JSON → 粘贴文件内容即可           ║
╚══════════════════════════════════════════════════════════════╝
`);

  // 也输出摘要到终端
  console.log('拉取结果摘要:');
  console.log('─'.repeat(70));
  console.log('Ticker'.padEnd(8) + 'PE'.padStart(8) + 'PS'.padStart(8) + 'NTM PE'.padStart(9) +
    'FCF Mul'.padStart(10) + 'GM'.padStart(8) + 'NM'.padStart(8) + 'ROIC'.padStart(8));
  console.log('─'.repeat(70));
  for (const r of results) {
    console.log(
      r.ticker.padEnd(8) +
      fmtV(r.pe).padStart(8) +
      fmtV(r.ps).padStart(8) +
      fmtV(r.ntmPe).padStart(9) +
      fmtV(r.fcfMultiple).padStart(10) +
      fmtPct(r.grossMargin).padStart(8) +
      fmtPct(r.netMargin).padStart(8) +
      fmtPct(r.ttmRoicY4).padStart(8)
    );
  }
  console.log('─'.repeat(70));
}

main().catch(err => {
  console.error('致命错误:', err.message);
  process.exit(1);
});
