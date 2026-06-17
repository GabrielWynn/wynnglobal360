/**
 * Core price sync logic — shared between:
 *  - /api/model-portfolio/cron/prices  (Vercel Cron, daily)
 *  - /api/model-portfolio/admin/sync   (admin panel, on-demand)
 *
 * Strategy:
 *  1. FT Markets for all active funds (primary).
 *  2. Yahoo Finance fallback for funds FT skipped or failed.
 *
 * Only syncs funds that are currently active in at least one composition.
 */

import { supabaseAdmin } from "@/lib/supabase";
import {
  resolveFtSymbol,
  getFtHistoricalPrices,
  dateDaysAgo,
  ftThrottle,
} from "@/lib/ft-markets";
import {
  resolveSymbolByIsin,
  getHistoricalPrices as getYahooHistoricalPrices,
  getLatestPrice as getYahooLatestPrice,
  toYahooSymbol,
} from "@/lib/yahoo-finance";

export interface SyncResults {
  funds: {
    updated:      number;
    skipped:      number;
    errors:       number;
    active:       number;
    ftUpdated:    number;
    ftSkipped:    number;
    ftErrors:     number;
    yahooUpdated: number;
    yahooSkipped: number;
    yahooErrors:  number;
  };
  benchmarks: { updated: number; skipped: number; errors: number };
  timestamp:  string;
}

interface ActiveFund {
  id:           string;
  isin:         string;
  currency:     string;
  ft_symbol:    string | null;
  yahoo_symbol: string | null;
}

/** Returns the distinct fund IDs that are currently active in any composition. */
async function getActiveFundIds(): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);

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

async function syncFundViaFt(fund: ActiveFund): Promise<"updated" | "skipped" | "error"> {
  try {
    let ftSymbol = fund.ft_symbol;

    if (!ftSymbol) {
      const resolved = await resolveFtSymbol(fund.isin, fund.currency);
      if (!resolved) return "skipped";
      ftSymbol = resolved.symbol;
      await supabaseAdmin.from("mp_funds").update({ ft_symbol: ftSymbol }).eq("id", fund.id);
      await ftThrottle();
    }

    const endDate   = new Date().toISOString().slice(0, 10);
    const startDate = dateDaysAgo(14);
    const bars      = await getFtHistoricalPrices(ftSymbol, startDate, endDate);
    if (!bars.length) return "skipped";

    const rows = bars.map((b) => ({
      fund_id: fund.id,
      date:    b.date,
      price:   b.price,
      source:  "ft",
    }));

    const { error } = await supabaseAdmin
      .from("mp_fund_prices")
      .upsert(rows, { onConflict: "fund_id,date" });

    return error ? "error" : "updated";
  } catch {
    return "error";
  }
}

async function syncFundViaYahoo(fund: ActiveFund): Promise<"updated" | "skipped" | "error"> {
  try {
    let yahooSymbol = fund.yahoo_symbol;

    if (!yahooSymbol) {
      const resolved = await resolveSymbolByIsin(fund.isin);
      if (!resolved) return "skipped";
      yahooSymbol = resolved.symbol;
      await supabaseAdmin.from("mp_funds").update({ yahoo_symbol: yahooSymbol }).eq("id", fund.id);
    }

    const endDate   = new Date().toISOString().slice(0, 10);
    const startDate = dateDaysAgo(14);
    const bars      = await getYahooHistoricalPrices(yahooSymbol, startDate, endDate);
    if (!bars.length) return "skipped";

    const rows = bars.map((b) => ({
      fund_id: fund.id,
      date:    b.date,
      price:   b.price,
      source:  "yahoo",
    }));

    const { error } = await supabaseAdmin
      .from("mp_fund_prices")
      .upsert(rows, { onConflict: "fund_id,date" });

    return error ? "error" : "updated";
  } catch {
    return "error";
  }
}

export async function syncPrices(): Promise<SyncResults> {
  const results: SyncResults = {
    funds: {
      updated: 0, skipped: 0, errors: 0, active: 0,
      ftUpdated: 0, ftSkipped: 0, ftErrors: 0,
      yahooUpdated: 0, yahooSkipped: 0, yahooErrors: 0,
    },
    benchmarks: { updated: 0, skipped: 0, errors: 0 },
    timestamp:  new Date().toISOString(),
  };

  const activeFundIds = await getActiveFundIds();
  results.funds.active = activeFundIds.length;

  if (activeFundIds.length) {
    const { data: funds, error: fundsErr } = await supabaseAdmin
      .from("mp_funds")
      .select("id, isin, currency, ft_symbol, yahoo_symbol")
      .in("id", activeFundIds);

    if (fundsErr) throw new Error(`Failed to fetch active funds: ${fundsErr.message}`);

    const yahooCandidates: ActiveFund[] = [];

    for (const fund of (funds ?? []) as ActiveFund[]) {
      await ftThrottle();
      const outcome = await syncFundViaFt(fund);
      if (outcome === "updated")      results.funds.ftUpdated++;
      else if (outcome === "skipped") {
        results.funds.ftSkipped++;
        yahooCandidates.push(fund);
      } else                            results.funds.ftErrors++;
    }

    for (const fund of yahooCandidates) {
      const outcome = await syncFundViaYahoo(fund);
      if (outcome === "updated")      results.funds.yahooUpdated++;
      else if (outcome === "skipped") results.funds.yahooSkipped++;
      else                            results.funds.yahooErrors++;
    }

    results.funds.updated = results.funds.ftUpdated + results.funds.yahooUpdated;
    results.funds.skipped = results.funds.yahooSkipped;
    results.funds.errors  = results.funds.ftErrors + results.funds.yahooErrors;
  }

  // ── Benchmark prices (Yahoo Finance) ──────────────────────────────────────

  const { data: benchmarks, error: benchErr } = await supabaseAdmin
    .from("mp_benchmarks").select("id, ticker");

  if (benchErr) throw new Error(`Failed to fetch benchmarks: ${benchErr.message}`);

  for (const bench of benchmarks ?? []) {
    try {
      const latest = await getYahooLatestPrice(toYahooSymbol(bench.ticker));
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
