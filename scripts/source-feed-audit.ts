/**
 * Audit which price sources can supply daily closing NAV for each model-portfolio ISIN.
 *
 * Usage:  npx tsx scripts/source-feed-audit.ts
 *
 * Loads ISINs from mp_funds (Supabase) when available, else from performance CSV.
 * Tests Yahoo Finance search/chart and FT Markets tearsheet/AJAX.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";
import {
  resolveFtSymbol,
  getFtHistoricalPrices,
  ftThrottle,
} from "../lib/ft-markets";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface FundRow {
  isin: string;
  name: string;
  currency: string;
}

interface SourceResult {
  ok: boolean;
  detail: string;
  latestDate?: string;
  latestClose?: number;
}

interface AuditRow {
  isin: string;
  name: string;
  currency: string;
  yahoo: SourceResult;
  ft: SourceResult;
  route: "yahoo" | "ft" | "none";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function isRecent(date: string, maxAgeDays = 14): boolean {
  const t = new Date(date).getTime();
  const cutoff = Date.now() - maxAgeDays * 86400000;
  return !Number.isNaN(t) && t >= cutoff;
}

function extractIsinsFromCsv(): FundRow[] {
  const csvPath = path.resolve(process.cwd(), "scripts/data/performance_historical.csv");
  const csv = fs.readFileSync(csvPath, "utf8");
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true });
  const byIsin = new Map<string, FundRow>();

  for (const row of parsed.data) {
    const m = String(row.ISIN ?? "").match(/([A-Z]{2}[A-Z0-9]{9}[0-9])/);
    if (!m) continue;
    const isin = m[1];
    if (!byIsin.has(isin)) {
      byIsin.set(isin, {
        isin,
        name: row.Fund?.trim() || row.Name?.trim() || isin,
        currency: "USD",
      });
    }
  }
  return [...byIsin.values()].sort((a, b) => a.isin.localeCompare(b.isin));
}

async function loadFunds(): Promise<FundRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase
      .from("mp_funds")
      .select("isin, display_name, currency")
      .order("isin");
    if (!error && data?.length) {
      return data.map((f) => ({
        isin: f.isin as string,
        name: f.display_name as string,
        currency: (f.currency as string) || "USD",
      }));
    }
  }
  return extractIsinsFromCsv();
}

async function auditYahoo(isin: string): Promise<SourceResult> {
  try {
    const searchUrl =
      `https://query1.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(isin)}&quotesCount=8&newsCount=0&listsCount=0`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!searchRes.ok) {
      return { ok: false, detail: `Search HTTP ${searchRes.status}` };
    }
    const searchBody = (await searchRes.json()) as {
      quotes?: Array<{ symbol?: string; quoteType?: string; longname?: string; shortname?: string }>;
    };
    const quotes = searchBody.quotes ?? [];
    const hit =
      quotes.find((q) => q.symbol && /mutualfund|etf|equity/i.test(q.quoteType ?? "")) ??
      quotes[0];
    if (!hit?.symbol) return { ok: false, detail: "No Yahoo symbol for ISIN" };

    const chartUrl =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(hit.symbol)}` +
      `?interval=1d&range=1mo`;
    const chartRes = await fetch(chartUrl, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!chartRes.ok) {
      return { ok: false, detail: `${hit.symbol} chart HTTP ${chartRes.status}` };
    }
    const chart = (await chartRes.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const result = chart.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    let latestDate: string | undefined;
    let latestClose: number | undefined;
    for (let i = timestamps.length - 1; i >= 0; i--) {
      const c = closes[i];
      if (c != null && !Number.isNaN(c)) {
        latestDate = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
        latestClose = c;
        break;
      }
    }
    if (!latestDate || latestClose == null) {
      return { ok: false, detail: `${hit.symbol} — no daily close in chart` };
    }
    if (!isRecent(latestDate)) {
      return {
        ok: false,
        detail: `${hit.symbol} — stale last=${latestDate}`,
        latestDate,
        latestClose,
      };
    }
    return {
      ok: true,
      detail: hit.symbol,
      latestDate,
      latestClose,
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Yahoo error" };
  }
}

async function auditFt(isin: string, currency: string): Promise<SourceResult> {
  try {
    const resolved = await resolveFtSymbol(isin, currency);
    if (!resolved) return { ok: false, detail: "FT tearsheet not found" };
    await ftThrottle(200);
    const bars = await getFtHistoricalPrices(resolved.symbol, daysAgo(21), daysAgo(0));
    if (!bars.length) {
      return { ok: false, detail: `symbol ${resolved.symbol} — no NAV rows` };
    }
    const last = bars[bars.length - 1];
    if (!isRecent(last.date)) {
      return {
        ok: false,
        detail: `symbol ${resolved.symbol} — stale last=${last.date}`,
        latestDate: last.date,
        latestClose: last.price,
      };
    }
    return {
      ok: true,
      detail: resolved.symbol,
      latestDate: last.date,
      latestClose: last.price,
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "FT error" };
  }
}

function pickRoute(yahoo: SourceResult, ft: SourceResult): AuditRow["route"] {
  if (ft.ok) return "ft";
  if (yahoo.ok) return "yahoo";
  return "none";
}

async function main() {
  const funds = await loadFunds();
  console.log(`\n=== Source feed audit (${funds.length} ISINs) ===`);
  console.log(`Recent close = within last 14 calendar days\n`);

  const rows: AuditRow[] = [];

  for (let i = 0; i < funds.length; i++) {
    const fund = funds[i];
    process.stdout.write(`[${i + 1}/${funds.length}] ${fund.isin} ... `);

    const yahoo = await auditYahoo(fund.isin);
    await sleep(150);

    const ft = await auditFt(fund.isin, fund.currency);
    await ftThrottle(250);

    const route = pickRoute(yahoo, ft);
    rows.push({ ...fund, yahoo, ft, route });
    console.log(`Yahoo=${yahoo.ok ? "Y" : "n"} FT=${ft.ok ? "Y" : "n"} → ${route}`);
  }

  const countOk = (k: keyof Pick<AuditRow, "yahoo" | "ft">) =>
    rows.filter((r) => r[k].ok).length;

  const routeCounts = {
    yahoo: rows.filter((r) => r.route === "yahoo").length,
    ft: rows.filter((r) => r.route === "ft").length,
    none: rows.filter((r) => r.route === "none").length,
  };

  console.log("\n=== Summary (independent capability) ===");
  console.log(`Yahoo can feed daily close:  ${countOk("yahoo")} / ${rows.length}`);
  console.log(`FT can feed daily close:     ${countOk("ft")} / ${rows.length}`);

  console.log("\n=== Production routing (FT → Yahoo) ===");
  console.log(`Via FT primary:              ${routeCounts.ft}`);
  console.log(`Via Yahoo (FT miss):         ${routeCounts.yahoo}`);
  console.log(`No source (gap):             ${routeCounts.none}`);

  const gaps = rows.filter((r) => r.route === "none");
  if (gaps.length) {
    console.log("\n--- Gaps (no recent close from any source) ---");
    for (const g of gaps) {
      console.log(`  ${g.isin}  Yahoo: ${g.yahoo.detail} | FT: ${g.ft.detail}`);
    }
  }

  const yahooOnly = rows.filter((r) => !r.ft.ok && r.yahoo.ok);
  if (yahooOnly.length) {
    console.log(`\n--- FT miss but Yahoo OK (${yahooOnly.length}) — Yahoo fallback targets ---`);
    for (const r of yahooOnly) {
      console.log(`  ${r.isin}  Yahoo=${r.yahoo.detail} last=${r.yahoo.latestDate}`);
    }
  }

  const outPath = path.resolve(process.cwd(), "scripts/data/source-feed-audit.json");
  fs.writeFileSync(outPath, JSON.stringify({ auditedAt: new Date().toISOString(), rows }, null, 2));
  console.log(`\nFull results written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
