/**
 * POST /api/model-portfolio/admin/funds/seed-active
 *
 * Smart historical price seeder — scoped per fund per active date range.
 *
 * For each fund that appears in any composition, determines the exact
 * date range it is active (min effective_from → max effective_to or today),
 * then fetches EODHD prices only for that window.
 *
 * This is far more efficient than fetching all-time history for all 61 funds:
 *  - Inactive funds (dropped from portfolios) are not re-fetched
 *  - EODHD API calls are scoped to useful date ranges only
 *
 * Requires authenticated admin session.
 */

import { NextResponse } from "next/server";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";
import { getHistoricalPrices, resolveISINToTicker } from "@/lib/eodhd";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

async function requireAdmin(): Promise<boolean> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabaseAdmin
    .from("ifas").select("role").eq("user_id", user.id).maybeSingle();
  if (data?.role === "admin") return true;
  if (user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas").select("role").eq("email", user.email).maybeSingle();
    return byEmail?.role === "admin";
  }
  return false;
}

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // ── Step 1: derive per-fund active date ranges from compositions ──────────

  const { data: raw } = await supabaseAdmin
    .from("mp_composition_holdings")
    .select(`
      fund_id,
      mp_portfolio_compositions!inner(effective_from, effective_to),
      mp_funds!inner(id, isin, display_name, eodhd_ticker, eodhd_exchange)
    `);

  if (!raw?.length) {
    return NextResponse.json({ ok: true, message: "No compositions found", processed: 0 });
  }

  type FundRange = {
    fundId:    string;
    isin:      string;
    name:      string;
    ticker:    string | null;
    exchange:  string | null;
    from:      string;
    to:        string;  // today if any composition is still active
    isActive:  boolean; // has at least one active composition
  };

  const fundMap = new Map<string, FundRange>();

  for (const row of raw) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = (Array.isArray((row as any).mp_portfolio_compositions)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (row as any).mp_portfolio_compositions[0]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (row as any).mp_portfolio_compositions) as { effective_from: string; effective_to: string | null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fund = (Array.isArray((row as any).mp_funds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (row as any).mp_funds[0]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (row as any).mp_funds) as { id: string; isin: string; display_name: string; eodhd_ticker: string | null; eodhd_exchange: string | null };

    if (!comp || !fund) continue;

    const compFrom     = comp.effective_from;
    const compStillOn  = comp.effective_to === null;
    const compTo       = compStillOn ? today : comp.effective_to!;
    const fundId       = row.fund_id as string;

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
      // Expand date range to cover all compositions this fund appears in
      if (compFrom < existing.from) existing.from = compFrom;
      if (compStillOn || compTo > existing.to) {
        existing.to       = compStillOn ? today : compTo;
        existing.isActive = existing.isActive || compStillOn;
      }
    }
  }

  // ── Step 2: for each fund, fetch EODHD prices for its active range ────────

  const results: Array<{
    fund: string; isin: string; from: string; to: string; inserted: number; error?: string;
  }> = [];

  for (const range of fundMap.values()) {
    // Resolve ticker if missing
    let ticker = range.ticker && range.exchange
      ? `${range.ticker}.${range.exchange}`
      : null;

    if (!ticker) {
      const resolved = await resolveISINToTicker(range.isin);
      if (!resolved) {
        results.push({ fund: range.name, isin: range.isin, from: range.from, to: range.to, inserted: 0, error: "Ticker not found on EODHD" });
        continue;
      }
      ticker = resolved.ticker;
      // Persist ticker so future syncs don't need to resolve again
      await supabaseAdmin.from("mp_funds").update({
        eodhd_ticker:   resolved.ticker.split(".")[0],
        eodhd_exchange: resolved.exchange,
      }).eq("id", range.fundId);
    }

    try {
      const bars = await getHistoricalPrices(ticker, range.from, range.to);
      if (!bars.length) {
        results.push({ fund: range.name, isin: range.isin, from: range.from, to: range.to, inserted: 0, error: "No data from EODHD" });
        continue;
      }

      const rows = bars.map((b) => ({
        fund_id: range.fundId,
        date:    b.date,
        price:   b.adjusted_close ?? b.close,
        source:  "eodhd",
      }));

      let inserted = 0;
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabaseAdmin
          .from("mp_fund_prices")
          .upsert(rows.slice(i, i + CHUNK), { onConflict: "fund_id,date" });
        if (!error) inserted += Math.min(CHUNK, rows.length - i);
      }

      results.push({ fund: range.name, isin: range.isin, from: range.from, to: range.to, inserted });
    } catch (err) {
      results.push({
        fund:     range.name,
        isin:     range.isin,
        from:     range.from,
        to:       range.to,
        inserted: 0,
        error:    err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const errors        = results.filter((r) => r.error).length;

  return NextResponse.json({
    ok:             true,
    fundsProcessed: fundMap.size,
    totalInserted,
    errors,
    results,
  });
}
