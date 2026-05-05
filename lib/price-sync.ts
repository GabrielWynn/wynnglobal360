/**
 * Core price sync logic — shared between:
 *  - /api/model-portfolio/cron/prices  (Vercel Cron, daily)
 *  - /api/model-portfolio/admin/sync   (admin panel, on-demand)
 *
 * Only syncs funds that are currently active in at least one composition
 * (effective_to IS NULL or effective_to >= today).  Inactive funds are
 * never touched — their historical prices stay in the DB but no new
 * prices are fetched for them.
 */

import { supabaseAdmin } from "@/lib/supabase";
import { resolveISINToTicker, getLatestPrice } from "@/lib/eodhd";

export interface SyncResults {
  funds:      { updated: number; skipped: number; errors: number; active: number };
  benchmarks: { updated: number; skipped: number; errors: number };
  timestamp:  string;
}

/** Returns the distinct fund IDs that are currently active in any composition. */
async function getActiveFundIds(): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);

  // Active compositions = effective_to is null OR effective_to is in the future
  const { data: activeComps } = await supabaseAdmin
    .from("mp_portfolio_compositions")
    .select("id")
    .or(`effective_to.is.null,effective_to.gte.${today}`);

  if (!activeComps?.length) return [];

  const activeCompIds = activeComps.map((c) => c.id);

  const { data: holdings } = await supabaseAdmin
    .from("mp_composition_holdings")
    .select("fund_id")
    .in("composition_id", activeCompIds);

  return [...new Set((holdings ?? []).map((h) => h.fund_id as string))];
}

export async function syncPrices(): Promise<SyncResults> {
  const results: SyncResults = {
    funds:      { updated: 0, skipped: 0, errors: 0, active: 0 },
    benchmarks: { updated: 0, skipped: 0, errors: 0 },
    timestamp:  new Date().toISOString(),
  };

  // ── Active fund prices ─────────────────────────────────────────────────────

  const activeFundIds = await getActiveFundIds();
  results.funds.active = activeFundIds.length;

  if (activeFundIds.length) {
    const { data: funds, error: fundsErr } = await supabaseAdmin
      .from("mp_funds")
      .select("id, isin, eodhd_ticker, eodhd_exchange")
      .in("id", activeFundIds);

    if (fundsErr) throw new Error(`Failed to fetch active funds: ${fundsErr.message}`);

    for (const fund of funds ?? []) {
      try {
        let ticker =
          fund.eodhd_ticker && fund.eodhd_exchange
            ? `${fund.eodhd_ticker}.${fund.eodhd_exchange}`
            : null;

        if (!ticker) {
          const resolved = await resolveISINToTicker(fund.isin);
          if (!resolved) { results.funds.skipped++; continue; }
          ticker = resolved.ticker;
          await supabaseAdmin.from("mp_funds").update({
            eodhd_ticker:   resolved.ticker.split(".")[0],
            eodhd_exchange: resolved.exchange,
          }).eq("id", fund.id);
        }

        const latest = await getLatestPrice(ticker);
        if (!latest) { results.funds.skipped++; continue; }

        const { error } = await supabaseAdmin.from("mp_fund_prices").upsert(
          { fund_id: fund.id, date: latest.date, price: latest.price, source: "eodhd" },
          { onConflict: "fund_id,date" }
        );
        error ? results.funds.errors++ : results.funds.updated++;
      } catch {
        results.funds.errors++;
      }
    }
  }

  // ── Benchmark prices ───────────────────────────────────────────────────────

  const { data: benchmarks, error: benchErr } = await supabaseAdmin
    .from("mp_benchmarks").select("id, ticker");

  if (benchErr) throw new Error(`Failed to fetch benchmarks: ${benchErr.message}`);

  for (const bench of benchmarks ?? []) {
    try {
      const latest = await getLatestPrice(bench.ticker);
      if (!latest) { results.benchmarks.skipped++; continue; }

      const { error } = await supabaseAdmin.from("mp_benchmark_prices").upsert(
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
