/**
 * POST /api/model-portfolio/admin/funds/historical
 *
 * One-time (re-runnable) seeder that fetches daily NAV history for all
 * funds, going back to the earliest portfolio period start date.
 *
 * Requires authenticated admin session.
 */

import { NextResponse } from "next/server";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";
import { fetchFundPriceHistory } from "@/lib/fund-price-sources";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

async function requireAdmin() {
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

  const { data: earliest } = await supabaseAdmin
    .from("mp_portfolio_periods")
    .select("start_date")
    .order("start_date")
    .limit(1)
    .maybeSingle();

  const fromDate = earliest?.start_date ?? "2020-01-01";
  const toDate   = new Date().toISOString().slice(0, 10);

  const { data: funds } = await supabaseAdmin
    .from("mp_funds")
    .select("id, isin, display_name, currency, ft_symbol, yahoo_symbol");

  if (!funds?.length) {
    return NextResponse.json({ ok: true, message: "No funds found", inserted: 0 });
  }

  const results: Array<{
    fund: string; isin: string; inserted: number; error?: string;
  }> = [];

  for (const fund of funds) {
    try {
      const bars = await fetchFundPriceHistory(fund, fromDate, toDate);

      if (!bars.length) {
        results.push({
          fund: fund.display_name, isin: fund.isin, inserted: 0,
          error: "No data from FT or Yahoo",
        });
        continue;
      }

      const rows = bars.map((b) => ({
        fund_id: fund.id,
        date:    b.date,
        price:   b.price,
        source:  b.source,
      }));

      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabaseAdmin
          .from("mp_fund_prices")
          .upsert(rows.slice(i, i + CHUNK), { onConflict: "fund_id,date" });
        if (!error) inserted += Math.min(CHUNK, rows.length - i);
      }

      results.push({ fund: fund.display_name, isin: fund.isin, inserted });
    } catch (err) {
      results.push({
        fund:     fund.display_name,
        isin:     fund.isin,
        inserted: 0,
        error:    err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const errors        = results.filter((r) => r.error);

  return NextResponse.json({
    ok:        true,
    fromDate,
    toDate,
    fundsProcessed: funds.length,
    totalInserted,
    errors:    errors.length,
    results,
  });
}
