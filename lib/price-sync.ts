/**
 * Core price sync logic — shared between:
 *  - /api/model-portfolio/cron/prices  (Vercel Cron, daily)
 *  - /api/model-portfolio/admin/sync   (admin panel, on-demand)
 */

import { supabaseAdmin } from "@/lib/supabase";
import { resolveISINToTicker, getLatestPrice } from "@/lib/eodhd";

export interface SyncResults {
  funds:      { updated: number; skipped: number; errors: number };
  benchmarks: { updated: number; skipped: number; errors: number };
  timestamp:  string;
}

export async function syncPrices(): Promise<SyncResults> {
  const results: SyncResults = {
    funds:      { updated: 0, skipped: 0, errors: 0 },
    benchmarks: { updated: 0, skipped: 0, errors: 0 },
    timestamp:  new Date().toISOString(),
  };

  // ── Fund prices ────────────────────────────────────────────────────────────

  const { data: funds, error: fundsErr } = await supabaseAdmin
    .from("mp_funds")
    .select("id, isin, eodhd_ticker, eodhd_exchange");

  if (fundsErr) throw new Error(`Failed to fetch funds: ${fundsErr.message}`);

  for (const fund of funds ?? []) {
    try {
      let ticker =
        fund.eodhd_ticker && fund.eodhd_exchange
          ? `${fund.eodhd_ticker}.${fund.eodhd_exchange}`
          : null;

      // Resolve ticker from EODHD if not stored yet
      if (!ticker) {
        const resolved = await resolveISINToTicker(fund.isin);
        if (!resolved) {
          results.funds.skipped++;
          continue;
        }
        ticker = resolved.ticker;

        await supabaseAdmin
          .from("mp_funds")
          .update({
            eodhd_ticker:   resolved.ticker.split(".")[0],
            eodhd_exchange: resolved.exchange,
          })
          .eq("id", fund.id);
      }

      const latest = await getLatestPrice(ticker);
      if (!latest) {
        results.funds.skipped++;
        continue;
      }

      const { error } = await supabaseAdmin
        .from("mp_fund_prices")
        .upsert(
          { fund_id: fund.id, date: latest.date, price: latest.price, source: "eodhd" },
          { onConflict: "fund_id,date" }
        );

      error ? results.funds.errors++ : results.funds.updated++;
    } catch {
      results.funds.errors++;
    }
  }

  // ── Benchmark prices ───────────────────────────────────────────────────────

  const { data: benchmarks, error: benchErr } = await supabaseAdmin
    .from("mp_benchmarks")
    .select("id, ticker");

  if (benchErr) throw new Error(`Failed to fetch benchmarks: ${benchErr.message}`);

  for (const bench of benchmarks ?? []) {
    try {
      const latest = await getLatestPrice(bench.ticker);
      if (!latest) {
        results.benchmarks.skipped++;
        continue;
      }

      const { error } = await supabaseAdmin
        .from("mp_benchmark_prices")
        .upsert(
          { benchmark_id: bench.id, date: latest.date, price: latest.price },
          { onConflict: "benchmark_id,date" }
        );

      error ? results.benchmarks.errors++ : results.benchmarks.updated++;
    } catch {
      results.benchmarks.errors++;
    }
  }

  return results;
}
