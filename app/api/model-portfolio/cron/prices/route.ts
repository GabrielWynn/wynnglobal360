/**
 * POST /api/model-portfolio/cron/prices
 *
 * Daily price sync — called automatically (Vercel Cron or external scheduler).
 * Also callable manually from the admin panel.
 *
 * For each fund that has an eodhd_ticker stored, fetches today's latest price
 * and upserts it into mp_fund_prices.
 * Does the same for all benchmarks in mp_benchmarks.
 *
 * If a fund has no eodhd_ticker yet, attempts to resolve it via ISIN search
 * and persists the ticker for future runs.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  resolveISINToTicker,
  getLatestPrice,
} from "@/lib/eodhd";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Auth: only allow requests that carry the service-role key as a Bearer token
// (Vercel Cron sends it via the Authorization header, admin UI does the same)
// ---------------------------------------------------------------------------
function isAuthorised(request: Request): boolean {
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const results = {
    funds:      { updated: 0, skipped: 0, errors: 0 },
    benchmarks: { updated: 0, skipped: 0, errors: 0 },
  };

  // -------------------------------------------------------------------------
  // 1. Sync fund prices
  // -------------------------------------------------------------------------
  const { data: funds, error: fundsErr } = await supabaseAdmin
    .from("mp_funds")
    .select("id, isin, eodhd_ticker, eodhd_exchange");

  if (fundsErr) {
    return NextResponse.json({ error: fundsErr.message }, { status: 500 });
  }

  for (const fund of funds ?? []) {
    try {
      let ticker =
        fund.eodhd_ticker && fund.eodhd_exchange
          ? `${fund.eodhd_ticker}.${fund.eodhd_exchange}`
          : null;

      // If we don't have a ticker yet, try to resolve it
      if (!ticker) {
        const resolved = await resolveISINToTicker(fund.isin);
        if (!resolved) {
          results.funds.skipped++;
          continue;
        }
        ticker = resolved.ticker;

        // Persist so we don't need to search again tomorrow
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

      if (error) {
        results.funds.errors++;
      } else {
        results.funds.updated++;
      }
    } catch {
      results.funds.errors++;
    }
  }

  // -------------------------------------------------------------------------
  // 2. Sync benchmark prices
  // -------------------------------------------------------------------------
  const { data: benchmarks, error: benchErr } = await supabaseAdmin
    .from("mp_benchmarks")
    .select("id, ticker");

  if (benchErr) {
    return NextResponse.json({ error: benchErr.message }, { status: 500 });
  }

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

      if (error) {
        results.benchmarks.errors++;
      } else {
        results.benchmarks.updated++;
      }
    } catch {
      results.benchmarks.errors++;
    }
  }

  return NextResponse.json({ ok: true, results });
}
