/**
 * POST /api/model-portfolio/admin/benchmarks/historical
 *
 * One-time (and re-runnable) seeder that fetches daily historical prices
 * for all benchmarks from EODHD and upserts into mp_benchmark_prices.
 *
 * Date range: earliest portfolio period start_date → today.
 * Admin-only: checks that the caller is an authenticated admin.
 */

import { NextResponse } from "next/server";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";
import { getHistoricalPrices } from "@/lib/eodhd";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel max for hobby / pro plans

// ---------------------------------------------------------------------------
// Auth helper — requires authenticated admin session
// ---------------------------------------------------------------------------
async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: Response }> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) as Response };
  }

  const { data } = await supabaseAdmin
    .from("ifas")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (data?.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) as Response };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // Find the earliest period start date across all platforms
  const { data: earliest } = await supabaseAdmin
    .from("mp_portfolio_periods")
    .select("start_date")
    .order("start_date")
    .limit(1)
    .maybeSingle();

  const fromDate = earliest?.start_date ?? "2020-01-01";
  const toDate   = new Date().toISOString().slice(0, 10);

  // Fetch all benchmarks
  const { data: benchmarks } = await supabaseAdmin
    .from("mp_benchmarks")
    .select("id, name, ticker");

  if (!benchmarks?.length) {
    return NextResponse.json({ ok: true, message: "No benchmarks configured", inserted: 0 });
  }

  const results: Array<{ benchmark: string; inserted: number; error?: string }> = [];

  for (const bench of benchmarks) {
    try {
      const bars = await getHistoricalPrices(bench.ticker, fromDate, toDate);

      if (!bars.length) {
        results.push({ benchmark: bench.name, inserted: 0, error: "No data from EODHD" });
        continue;
      }

      // Upsert in chunks
      const rows = bars.map((b) => ({
        benchmark_id: bench.id,
        date:         b.date,
        price:        b.adjusted_close ?? b.close,
      }));

      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabaseAdmin
          .from("mp_benchmark_prices")
          .upsert(rows.slice(i, i + CHUNK), { onConflict: "benchmark_id,date" });
        if (!error) inserted += Math.min(CHUNK, rows.length - i);
      }

      results.push({ benchmark: bench.name, inserted });
    } catch (err) {
      results.push({
        benchmark: bench.name,
        inserted:  0,
        error:     err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ ok: true, fromDate, toDate, results });
}
