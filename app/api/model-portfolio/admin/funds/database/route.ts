/**
 * GET /api/model-portfolio/admin/funds/database
 *
 * Returns every fund in mp_funds enriched with:
 *  - isActive     → appears in at least one composition with effective_to = null
 *  - platforms    → distinct platforms that use this fund (ever)
 *  - compositions → total number of compositions this fund appears in
 *  - firstPrice   → earliest date in mp_fund_prices
 *  - lastPrice    → most recent date in mp_fund_prices
 *  - priceRows    → total price rows stored
 *  - tickerStatus → "resolved" | "unresolved"
 *  - priceStatus  → "ok" | "stale" | "empty"
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function businessDaysAgo(n: number): string {
  const d = new Date();
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
  }
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const staleThreshold = businessDaysAgo(5);

  // ── 1. All funds ──────────────────────────────────────────────────────────
  const { data: funds, error } = await supabaseAdmin
    .from("mp_funds")
    .select("id, isin, display_name, currency, eodhd_ticker, eodhd_exchange")
    .order("display_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!funds?.length) return NextResponse.json([]);

  // ── 2. Active fund IDs (in a composition with effective_to = null) ─────────
  const { data: activeComps } = await supabaseAdmin
    .from("mp_portfolio_compositions")
    .select("mp_composition_holdings(fund_id)")
    .is("effective_to", null);

  const activeFundIds = new Set<string>(
    (activeComps ?? []).flatMap(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => (c.mp_composition_holdings ?? []).map((h: any) => h.fund_id as string)
    )
  );

  // ── 3. Per-fund platform usage (across all compositions, ever) ───────────
  const { data: usageRows } = await supabaseAdmin
    .from("mp_composition_holdings")
    .select(`
      fund_id,
      mp_portfolio_compositions!inner(
        platform_id,
        mp_platforms(name)
      )
    `);

  // fund_id → { platforms: Set<name>, compositionCount }
  type Usage = { platforms: Set<string>; compositionCount: number };
  const usageMap = new Map<string, Usage>();

  for (const row of usageRows ?? []) {
    const fid  = row.fund_id as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = (row as any).mp_portfolio_compositions as { mp_platforms: { name: string } | null } | null;
    const platName = comp?.mp_platforms?.name ?? null;

    if (!usageMap.has(fid)) usageMap.set(fid, { platforms: new Set(), compositionCount: 0 });
    const u = usageMap.get(fid)!;
    u.compositionCount++;
    if (platName) u.platforms.add(platName);
  }

  // ── 4. Price stats per fund ───────────────────────────────────────────────
  const fundIds = funds.map((f) => f.id);

  const { data: priceRows } = await supabaseAdmin
    .from("mp_fund_prices")
    .select("fund_id, date")
    .in("fund_id", fundIds)
    .limit(200000); // well above actual max

  const priceMap = new Map<string, { first: string; last: string; count: number }>();
  for (const row of priceRows ?? []) {
    const fid = row.fund_id as string;
    const ex  = priceMap.get(fid);
    if (!ex) {
      priceMap.set(fid, { first: row.date, last: row.date, count: 1 });
    } else {
      if (row.date < ex.first) ex.first = row.date;
      if (row.date > ex.last)  ex.last  = row.date;
      ex.count++;
    }
  }

  // ── 5. Assemble response ─────────────────────────────────────────────────
  const result = funds.map((f) => {
    const usage  = usageMap.get(f.id);
    const prices = priceMap.get(f.id);

    const tickerStatus: "resolved" | "unresolved" =
      f.eodhd_ticker ? "resolved" : "unresolved";

    const priceStatus: "ok" | "stale" | "empty" =
      !prices
        ? "empty"
        : prices.last >= staleThreshold
        ? "ok"
        : "stale";

    return {
      id:            f.id,
      isin:          f.isin,
      name:          f.display_name,
      currency:      f.currency,
      ticker:        f.eodhd_ticker ?? null,
      exchange:      f.eodhd_exchange ?? null,
      isActive:      activeFundIds.has(f.id),
      platforms:     usage ? [...usage.platforms].sort() : [],
      compositions:  usage?.compositionCount ?? 0,
      firstPrice:    prices?.first ?? null,
      lastPrice:     prices?.last  ?? null,
      priceRows:     prices?.count ?? 0,
      tickerStatus,
      priceStatus,
    };
  });

  return NextResponse.json(result);
}
