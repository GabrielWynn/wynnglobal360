/**
 * GET /api/model-portfolio/admin/price-coverage
 *
 * Returns price coverage stats for every fund that is currently active
 * (appears in at least one composition with effective_to = null).
 *
 * Response shape per fund:
 *  { fundId, isin, name, platforms[], firstPrice, lastPrice, rows, status }
 *
 * status:
 *  "ok"     — lastPrice is within the last 5 business days
 *  "stale"  — lastPrice is older than 5 business days
 *  "empty"  — no prices stored yet
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function businessDaysAgo(n: number): string {
  const d   = new Date();
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);

  // 1. Find all active compositions (effective_to = null)
  const { data: activeComps } = await supabaseAdmin
    .from("mp_portfolio_compositions")
    .select(`
      id, platform_id, profile_id,
      mp_platforms(name),
      mp_risk_profiles(label),
      mp_composition_holdings(fund_id, mp_funds(id, isin, display_name, eodhd_ticker))
    `)
    .is("effective_to", null);

  if (!activeComps?.length) {
    return NextResponse.json([]);
  }

  // 2. Build fund → platforms map
  type FundEntry = {
    fundId:    string;
    isin:      string;
    name:      string;
    hasTicker: boolean;
    platforms: string[];
  };

  const fundMap = new Map<string, FundEntry>();

  for (const comp of activeComps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const platName  = ((comp as any).mp_platforms as { name: string } | null)?.name ?? "?";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profLabel = ((comp as any).mp_risk_profiles as { label: string } | null)?.label ?? "?";
    const label     = `${platName} / ${profLabel}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const h of (comp as any).mp_composition_holdings ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fund = Array.isArray(h.mp_funds) ? h.mp_funds[0] : h.mp_funds as any;
      if (!fund) continue;

      const fundId = h.fund_id as string;
      const entry  = fundMap.get(fundId);
      if (!entry) {
        fundMap.set(fundId, {
          fundId,
          isin:      fund.isin,
          name:      fund.display_name,
          hasTicker: !!fund.eodhd_ticker,
          platforms: [label],
        });
      } else if (!entry.platforms.includes(label)) {
        entry.platforms.push(label);
      }
    }
  }

  const activeFundIds = [...fundMap.keys()];
  if (!activeFundIds.length) return NextResponse.json([]);

  // 3. Fetch price rows (only date column) for active funds to compute stats
  const { data: priceRows } = await supabaseAdmin
    .from("mp_fund_prices")
    .select("fund_id, date")
    .in("fund_id", activeFundIds);

  // 4. Aggregate per fund
  const statsMap = new Map<string, { first: string; last: string; count: number }>();
  for (const row of priceRows ?? []) {
    const fid      = row.fund_id as string;
    const existing = statsMap.get(fid);
    if (!existing) {
      statsMap.set(fid, { first: row.date, last: row.date, count: 1 });
    } else {
      if (row.date < existing.first) existing.first = row.date;
      if (row.date > existing.last)  existing.last  = row.date;
      existing.count++;
    }
  }

  const staleThreshold = businessDaysAgo(5);

  // 5. Build response
  const coverage = [...fundMap.values()].map((f) => {
    const stats = statsMap.get(f.fundId);

    let status: "ok" | "stale" | "empty" | "no_ticker" = "empty";
    if (!f.hasTicker) {
      status = "no_ticker";
    } else if (stats) {
      status = stats.last >= staleThreshold ? "ok" : "stale";
    }

    return {
      fundId:     f.fundId,
      isin:       f.isin,
      name:       f.name,
      hasTicker:  f.hasTicker,
      platforms:  f.platforms.sort(),
      firstPrice: stats?.first ?? null,
      lastPrice:  stats?.last  ?? null,
      rows:       stats?.count ?? 0,
      status,
      today,
    };
  });

  // Sort: no_ticker first (needs attention), then stale, then ok
  const order: Record<string, number> = { no_ticker: 0, stale: 1, empty: 2, ok: 3 };
  coverage.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  return NextResponse.json(coverage);
}
