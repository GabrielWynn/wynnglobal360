/**
 * Seed historical fund prices from EODHD.
 *
 * For each fund that appears in any composition, determines the exact
 * date range it is active and fetches full daily NAV history from EODHD.
 * With a paid EODHD plan this covers 30+ years of data.
 *
 * Usage:  npx tsx scripts/seed-historical-prices.ts
 */

import * as path from "path";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const EODHD_KEY = process.env.EODHD_API_KEY!;
const BASE_URL  = "https://eodhd.com/api";

if (!EODHD_KEY) {
  console.error("EODHD_API_KEY is not set in .env.local");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// EODHD helpers
// ---------------------------------------------------------------------------

async function searchByISIN(isin: string): Promise<Array<{ Code: string; Exchange: string; Name: string; ISIN: string | null; Type: string | null }>> {
  const url = `${BASE_URL}/search/${encodeURIComponent(isin)}?api_token=${EODHD_KEY}&fmt=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function pickBestTicker(results: Awaited<ReturnType<typeof searchByISIN>>, isin: string) {
  if (!results.length) return null;
  const exact = results.filter(r => r.ISIN?.toUpperCase() === isin.toUpperCase());
  const pool  = exact.length ? exact : results;
  const fund  = pool.find(r => ["FUND", "ETF"].includes((r.Type as string)?.toUpperCase() ?? "")) ?? pool[0];
  return fund ? `${fund.Code}.${fund.Exchange}` : null;
}

async function fetchHistoricalPrices(
  ticker: string,
  fromDate: string,
  toDate: string
): Promise<Array<{ date: string; close: number; adjusted_close: number }>> {
  const url = `${BASE_URL}/eod/${encodeURIComponent(ticker)}?api_token=${EODHD_KEY}&fmt=json&from=${fromDate}&to=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`\nEODHD Historical Price Seeder — ${today}\n${"─".repeat(60)}`);

  // Step 1: Derive per-fund active date ranges from compositions
  const { data: raw } = await db
    .from("mp_composition_holdings")
    .select(`
      fund_id,
      mp_portfolio_compositions!inner(effective_from, effective_to),
      mp_funds!inner(id, isin, display_name, eodhd_ticker, eodhd_exchange)
    `);

  if (!raw?.length) {
    console.log("No compositions found. Run the migration script first.");
    return;
  }

  type FundRange = {
    fundId:    string;
    isin:      string;
    name:      string;
    ticker:    string | null;
    exchange:  string | null;
    from:      string;
    to:        string;
    isActive:  boolean;
  };

  const fundMap = new Map<string, FundRange>();

  for (const row of raw) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = (Array.isArray((row as any).mp_portfolio_compositions)
      ? (row as any).mp_portfolio_compositions[0]
      : (row as any).mp_portfolio_compositions) as { effective_from: string; effective_to: string | null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fund = (Array.isArray((row as any).mp_funds)
      ? (row as any).mp_funds[0]
      : (row as any).mp_funds) as { id: string; isin: string; display_name: string; eodhd_ticker: string | null; eodhd_exchange: string | null };

    if (!comp || !fund) continue;

    const compFrom    = comp.effective_from as string;
    const compStillOn = comp.effective_to === null;
    const compTo      = compStillOn ? today : (comp.effective_to as string);
    const fundId      = row.fund_id as string;

    const existing = fundMap.get(fundId);
    if (!existing) {
      fundMap.set(fundId, {
        fundId,
        isin:     fund.isin,
        name:     fund.display_name,
        ticker:   fund.eodhd_ticker,
        exchange: fund.eodhd_exchange,
        from:     compFrom,
        to:       compTo,
        isActive: compStillOn,
      });
    } else {
      if (compFrom < existing.from) existing.from = compFrom;
      if (compStillOn || compTo > existing.to) {
        existing.to       = compStillOn ? today : compTo;
        existing.isActive = existing.isActive || compStillOn;
      }
    }
  }

  console.log(`Funds found across all compositions: ${fundMap.size}`);
  console.log(`Active funds (in current composition): ${[...fundMap.values()].filter(f => f.isActive).length}\n`);

  // Step 2: Process each fund
  let totalInserted = 0;
  let totalSkipped  = 0;
  let totalErrors   = 0;

  const funds = [...fundMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  for (const fund of funds) {
    process.stdout.write(`  ${fund.isin.padEnd(14)} ${fund.name.slice(0, 38).padEnd(40)} `);

    // Resolve ticker if not stored
    let ticker = fund.ticker && fund.exchange ? `${fund.ticker}.${fund.exchange}` : null;

    if (!ticker) {
      const results = await searchByISIN(fund.isin);
      ticker = pickBestTicker(results, fund.isin);

      if (ticker) {
        const [code, exchange] = ticker.split(".");
        await db.from("mp_funds").update({ eodhd_ticker: code, eodhd_exchange: exchange }).eq("id", fund.fundId);
      } else {
        console.log(`✗ ticker not found`);
        totalSkipped++;
        continue;
      }
    }

    // Fetch historical prices
    try {
      const bars = await fetchHistoricalPrices(ticker, fund.from, fund.to);

      if (!bars.length) {
        console.log(`✗ no data (${fund.from} → ${fund.to})`);
        totalSkipped++;
        continue;
      }

      const rows = bars.map(b => ({
        fund_id: fund.fundId,
        date:    b.date,
        price:   b.adjusted_close ?? b.close,
        source:  "eodhd",
      }));

      // Upsert in chunks of 500
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db
          .from("mp_fund_prices")
          .upsert(rows.slice(i, i + 500), { onConflict: "fund_id,date" });
        if (!error) inserted += Math.min(500, rows.length - i);
      }

      totalInserted += inserted;
      const range = `${bars[0].date} → ${bars[bars.length - 1].date}`;
      console.log(`✓ ${inserted.toLocaleString().padStart(5)} rows  [${range}]`);
    } catch (err) {
      console.log(`✗ error: ${err instanceof Error ? err.message : "unknown"}`);
      totalErrors++;
    }
  }

  // Summary
  console.log(`\n${"─".repeat(60)}`);
  console.log(`✓ Done`);
  console.log(`  Total rows inserted / updated : ${totalInserted.toLocaleString()}`);
  console.log(`  Funds skipped (no ticker/data): ${totalSkipped}`);
  console.log(`  Errors                        : ${totalErrors}`);

  // Quick date-range check
  const { data: stats } = await db
    .from("mp_fund_prices")
    .select("date")
    .order("date");

  if (stats?.length) {
    console.log(`\n  Price coverage in DB: ${stats[0].date} → ${stats[stats.length - 1].date}`);
    console.log(`  Total price rows    : ${stats.length.toLocaleString()}`);
  }
}

main().catch(err => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
