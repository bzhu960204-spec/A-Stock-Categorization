#!/usr/bin/env python3
"""
估值数据拉取脚本 (Python版)

从 stockanalysis.com 爬取美股估值数据：
  - 季度毛利率/净利率 → /financials/?p=quarterly
  - 4年历史ROIC       → /financials/ratios/
  - EV/FCF TTM        → /statistics/

输出符合应用导入格式的 JSON 文件。

用法:
  python scripts/fetch_valuations.py AAPL MSFT GOOGL NVDA META AMZN NOW TSLA
  python scripts/fetch_valuations.py AAPL --output my-output.json

依赖:
  pip install -r scripts/requirements.txt

输出:
  ./valuation-import-YYYY-MM-DD.json
"""

import sys
import json
import time
import re
from datetime import date
from pathlib import Path

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
}


# ── HTTP 请求 ──────────────────────────────────────────────────────────────

def fetch_page(url: str, retries: int = 2) -> str:
    """Fetch a page with retries and rate limit handling."""
    for attempt in range(retries + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20)
            if resp.status_code == 200:
                return resp.text
            elif resp.status_code == 429:
                wait = 5 * (attempt + 1)
                print(f"    ⏸️  Rate limited, waiting {wait}s...")
                time.sleep(wait)
            else:
                print(f"    ❌ HTTP {resp.status_code}: {url}")
                return ""
        except requests.RequestException as e:
            if attempt < retries:
                time.sleep(3)
            else:
                print(f"    ❌ Request failed: {e}")
                return ""
    return ""


# ── stockanalysis: 季度毛利率 / 净利率 ────────────────────────────────────

def fetch_quarterly_margins(ticker: str) -> dict:
    """
    从 stockanalysis.com 季度利润表获取最近4个季度的毛利率和净利率。
    返回 Q1(最早) 到 Q4(最近) + TTM加权值。
    """
    result = {
        "grossMargin": None,
        "grossMarginQ1": None, "grossMarginQ2": None,
        "grossMarginQ3": None, "grossMarginQ4": None,
        "netMargin": None,
        "netMarginQ1": None, "netMarginQ2": None,
        "netMarginQ3": None, "netMarginQ4": None,
    }

    url = f"https://stockanalysis.com/stocks/{ticker.lower()}/financials/?p=quarterly"
    html = fetch_page(url)
    if not html:
        return result

    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if not table:
        print(f"    ⚠️  {ticker}: 季度财务表格未找到")
        return result

    # Parse table into a dict of {row_label: [values]}
    rows = table.find_all("tr")
    data = {}
    num_cols = 0
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) >= 2:
            label = cells[0].get_text(strip=True)
            values = [c.get_text(strip=True) for c in cells[1:]]
            data[label] = values
            num_cols = max(num_cols, len(values))

    # Extract Revenue, Gross Profit, Net Income for the 4 most recent quarters
    # Columns are in reverse chronological order (newest first)
    revenue_row = data.get("Revenue", [])
    gp_row = data.get("Gross Profit", [])
    ni_row = data.get("Net Income", [])

    if not revenue_row:
        print(f"    ⚠️  {ticker}: Revenue行未找到")
        return result

    # Take first 4 columns (most recent 4 quarters), then reverse to get Q1=oldest
    n = min(4, len(revenue_row))
    revenues = [_parse_number(revenue_row[i]) for i in range(n)]
    gross_profits = [_parse_number(gp_row[i]) if i < len(gp_row) else None for i in range(n)]
    net_incomes = [_parse_number(ni_row[i]) if i < len(ni_row) else None for i in range(n)]

    # Reverse: index 0 becomes Q4 (most recent) → after reverse, index 0 = oldest = Q1
    revenues.reverse()
    gross_profits.reverse()
    net_incomes.reverse()

    total_rev = 0.0
    total_gp = 0.0
    total_ni = 0.0

    for i in range(len(revenues)):
        rev = revenues[i]
        gp = gross_profits[i]
        ni = net_incomes[i]

        if rev and rev != 0:
            gm = round(gp / rev, 4) if gp is not None else None
            nm = round(ni / rev, 4) if ni is not None else None
        else:
            gm, nm = None, None

        q_num = i + 1  # 1=oldest (Q1), 4=newest (Q4)
        result[f"grossMarginQ{q_num}"] = gm
        result[f"netMarginQ{q_num}"] = nm

        if rev:
            total_rev += rev
        if gp:
            total_gp += gp
        if ni:
            total_ni += ni

    # TTM weighted margins
    if total_rev > 0:
        result["grossMargin"] = round(total_gp / total_rev, 4) if total_gp else None
        result["netMargin"] = round(total_ni / total_rev, 4) if total_ni else None

    return result


# ── stockanalysis: EV/FCF ──────────────────────────────────────────────────

def fetch_ev_fcf(ticker: str) -> dict:
    """
    从 stockanalysis.com statistics 页面获取 EV 和 FCF，计算 EV/FCF。
    """
    result = {"fcfMultiple": None}

    url = f"https://stockanalysis.com/stocks/{ticker.lower()}/statistics/"
    html = fetch_page(url)
    if not html:
        return result

    soup = BeautifulSoup(html, "html.parser")

    ev = None
    fcf = None

    # Search all tables for Enterprise Value and Free Cash Flow
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) >= 2:
                label = cells[0].get_text(strip=True)
                value = cells[1].get_text(strip=True)

                if "Enterprise Value" in label and "EV/" not in label:
                    ev = _parse_large_number(value)
                elif label == "Free Cash Flow":
                    fcf = _parse_large_number(value)

    if ev and fcf and fcf > 0:
        result["fcfMultiple"] = round(ev / fcf, 2)
    elif fcf is not None and fcf <= 0:
        print(f"    ⚠️  {ticker}: FCF为负 ({fcf:,.0f}), fcfMultiple设为null")

    return result


# ── stockanalysis: 4年 ROIC 历史 ──────────────────────────────────────────

def fetch_roic_history(ticker: str) -> dict:
    """
    从 stockanalysis.com 年度 ratios 页面获取近4年的 ROIC。
    返回 Y1(最早) 到 Y4(最近)。
    """
    result = {"ttmRoicY1": None, "ttmRoicY2": None, "ttmRoicY3": None, "ttmRoicY4": None}

    url = f"https://stockanalysis.com/stocks/{ticker.lower()}/financials/ratios/"
    html = fetch_page(url)
    if not html:
        return result

    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if not table:
        print(f"    ⚠️  {ticker}: ratios表格未找到")
        return result

    # Find the ROIC row
    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if cells and "ROIC" in cells[0].get_text():
            # Values: [label, Current, FY_newest, FY_next, ..., FY_oldest]
            # Skip "Current" (index 1), take next 4 FY values (index 2-5)
            values = [c.get_text(strip=True) for c in cells[1:]]

            # First value is "Current" (TTM), skip it; take next 4 which are fiscal years
            fy_values = []
            for v in values[1:]:  # Skip "Current"
                pct = _parse_pct(v)
                if pct is not None:
                    fy_values.append(pct)
                if len(fy_values) >= 4:
                    break

            # fy_values[0] = most recent FY, fy_values[3] = oldest FY
            # Reverse to get Y1=oldest, Y4=newest
            fy_values.reverse()
            for i, val in enumerate(fy_values):
                result[f"ttmRoicY{i + 1}"] = round(val, 4)

            break

    return result


# ── 数值解析工具函数 ─────────────────────────────────────────────────────────

def _parse_number(text: str):
    """解析财务数字 (e.g. '111,184' or '-5,234' or '94.03B')"""
    if not text or text == "-" or text == "n/a":
        return None
    text = text.strip().replace(",", "")
    try:
        return float(text)
    except ValueError:
        return _parse_large_number(text)


def _parse_large_number(text: str):
    """解析带单位的数字 (e.g. '4.35T', '129.17B', '523.4M')"""
    if not text or text == "-" or text == "n/a":
        return None
    text = text.strip().replace(",", "").replace("$", "")

    multipliers = {"T": 1e12, "B": 1e9, "M": 1e6, "K": 1e3}
    for suffix, mult in multipliers.items():
        if text.endswith(suffix):
            try:
                return float(text[:-1]) * mult
            except ValueError:
                return None
    try:
        return float(text)
    except ValueError:
        return None


def _parse_pct(text: str):
    """解析百分比字符串, 返回小数 (e.g. '48.24%' → 0.4824)"""
    if not text or text == "-" or text == "n/a":
        return None
    text = text.strip().replace(",", "").replace("%", "")
    try:
        return float(text) / 100.0
    except ValueError:
        return None


# ── 组装单只股票数据 ────────────────────────────────────────────────────────

def build_valuation(ticker: str) -> dict:
    """获取单只股票的所有估值数据"""
    print(f"  ⏳ {ticker} — 拉取中...")

    # 1. 季度利润率
    margins = fetch_quarterly_margins(ticker)
    time.sleep(1.5)

    # 2. EV/FCF
    ev_fcf = fetch_ev_fcf(ticker)
    time.sleep(1.5)

    # 3. 历史 ROIC
    roic = fetch_roic_history(ticker)
    time.sleep(1.5)

    # 4. 公司名称 (从 statistics 页面的 title 标签获取)
    company_name = ticker  # fallback

    # 组装
    result = {
        "ticker": ticker,
        "companyName": company_name,
        "pe": None,
        "ps": None,
        "ntmPe": None,
        "ntmPs": None,
        "grossMargin": margins["grossMargin"],
        "grossMarginQ1": margins["grossMarginQ1"],
        "grossMarginQ2": margins["grossMarginQ2"],
        "grossMarginQ3": margins["grossMarginQ3"],
        "grossMarginQ4": margins["grossMarginQ4"],
        "netMargin": margins["netMargin"],
        "nonGaapNetMargin": None,
        "netMarginQ1": margins["netMarginQ1"],
        "netMarginQ2": margins["netMarginQ2"],
        "netMarginQ3": margins["netMarginQ3"],
        "netMarginQ4": margins["netMarginQ4"],
        "fcfMultiple": ev_fcf["fcfMultiple"],
        "fwdFcfMultiple": None,
        "ttmRoicY1": roic["ttmRoicY1"],
        "ttmRoicY2": roic["ttmRoicY2"],
        "ttmRoicY3": roic["ttmRoicY3"],
        "ttmRoicY4": roic["ttmRoicY4"],
        "notes": f"自动拉取 @ {date.today().isoformat()} | stockanalysis.com",
    }

    # 打印摘要
    gm = margins["grossMarginQ4"]
    nm = margins["netMarginQ4"]
    fcf = ev_fcf["fcfMultiple"]
    r4 = roic["ttmRoicY4"]
    print(f"  ✅ {ticker}")
    print(f"     GM={_fmt_pct(gm)} NM={_fmt_pct(nm)} EV/FCF={_fmt_val(fcf)} ROIC(Y4)={_fmt_pct(r4)}")

    return result


# ── 格式化工具函数 ────────────────────────────────────────────────────────

def _fmt_pct(v):
    return f"{v*100:.1f}%" if v is not None else "N/A"

def _fmt_val(v):
    return f"{v:.1f}" if v is not None else "N/A"


# ── CLI 参数解析 ───────────────────────────────────────────────────────────

def parse_args():
    args = sys.argv[1:]
    tickers = []
    output = None

    i = 0
    while i < len(args):
        if args[i] == "--output" and i + 1 < len(args):
            output = args[i + 1]
            i += 2
        elif args[i] == "--tickers" and i + 1 < len(args):
            tickers.extend(t.strip().upper() for t in args[i + 1].split(","))
            i += 2
        elif not args[i].startswith("--"):
            tickers.append(args[i].upper())
            i += 1
        else:
            i += 1

    return tickers, output


# ── 主流程 ─────────────────────────────────────────────────────────────────

def main():
    tickers, output_path = parse_args()

    if not tickers:
        print("""
╔══════════════════════════════════════════════════════════════╗
║  估值数据拉取工具 (stockanalysis.com)                        ║
╚══════════════════════════════════════════════════════════════╝

用法:
  python scripts/fetch_valuations.py AAPL MSFT GOOGL NVDA
  python scripts/fetch_valuations.py --tickers AAPL,MSFT,GOOGL
  python scripts/fetch_valuations.py AAPL --output my-file.json

数据来源 (全部来自 stockanalysis.com):
  • 季度毛利率/净利率 → /financials/?p=quarterly
  • EV/FCF TTM        → /statistics/
  • 历史ROIC (4年)    → /financials/ratios/

安装依赖:
  pip install -r scripts/requirements.txt
""")
        sys.exit(0)

    print(f"\n📊 开始拉取 {len(tickers)} 只股票的估值数据...\n")

    results = []
    for ticker in tickers:
        try:
            data = build_valuation(ticker)
            results.append(data)
        except Exception as e:
            print(f"  ❌ {ticker} — 拉取失败: {e}")
        print()

    if not results:
        print("⚠️  没有成功拉取到任何数据")
        sys.exit(1)

    # 输出文件
    if not output_path:
        root = Path(__file__).resolve().parent.parent
        output_path = root / f"valuation-import-{date.today().isoformat()}.json"
    else:
        output_path = Path(output_path)

    output_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    # 打印摘要
    print("═" * 72)
    print(f"  ✅ 完成！成功拉取 {len(results)} / {len(tickers)} 只股票")
    print(f"  📁 输出文件: {output_path}")
    print("═" * 72)
    print()
    print(f"{'Ticker':<8}{'GM':>8}{'NM':>8}{'EV/FCF':>10}{'ROIC(Y4)':>10}")
    print("─" * 44)
    for r in results:
        print(
            f"{r['ticker']:<8}"
            f"{_fmt_pct(r['grossMarginQ4']):>8}"
            f"{_fmt_pct(r['netMarginQ4']):>8}"
            f"{_fmt_val(r['fcfMultiple']):>10}"
            f"{_fmt_pct(r['ttmRoicY4']):>10}"
        )
    print("─" * 44)


if __name__ == "__main__":
    main()
