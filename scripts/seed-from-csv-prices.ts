/**
 * Hybrid price seeder — CSV anchors + live price bridge
 *
 * Strategy:
 *  1. Read real observed NAV prices from mp_portfolio_holdings archive
 *     (initial_price + final_price at each period boundary).
 *  2. Build a chronological anchor chain per fund.
 *  3. Between consecutive anchors, generate daily prices using compound
 *     interpolation: price[d] = P0 × (P1/P0)^(d/N).
 *  4. Upsert with ignoreDuplicates=true so existing live prices
 *     are never overwritten — they take precedence for recent dates.
 *
 * Usage:  npx tsx scripts/seed-from-csv-prices.ts
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

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** All business days (Mon–Fri) between two ISO date strings, inclusive. */
function businessDaysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const cur = new Date(from + "T00:00:00Z");
  const end = new Date(to   + "T00:00:00Z");

  while (cur <= end) {
    const dow = cur.getUTCDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

// ---------------------------------------------------------------------------
// Compound interpolation
// ---------------------------------------------------------------------------

/**
 * Given two observed price anchors (P0 at startDate, P1 at endDate),
 * generates a daily price for every business day between them using
 * continuous compound growth.
 *
 * The end-point is included so that consecutive calls can share it.
 * Callers must deduplicate the join point.
 */
function interpolate(
  startDate:  string,
  startPrice: number,
  endDate:    string,
  endPrice:   number
): Array<{ date: string; price: number }> {
  if (startPrice <= 0 || endPrice <= 0) return [];

  const days = businessDaysBetween(startDate, endDate);
  if (days.length === 0) return [];
  if (days.length === 1) return [{ date: days[0], price: startPrice }];

  const n          = days.length - 1;           // number of intervals
  const dailyRate  = Math.pow(endPrice / startPrice, 1 / n) - 1;

  return days.map((date, i) => ({
    date,
    price: parseFloat((startPrice * Math.pow(1 + dailyRate, i)).toFixed(6)),
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nHybrid Price Seeder — CSV anchors + live prices`);
  console.log("─".repeat(70));

  // ── 1. Pull all price anchors from archive tables ────────────────────────
  const { data: holdings, error: hErr } = await db
    .from("mp_portfolio_holdings")
    .select(`
      fund_id,
      initial_price,
      final_price,
      mp_portfolio_periods!inner(start_date, end_date, is_open)
    `)
    .not("initial_price", "is", null)
    .limit(100000);  // override Supabase's default 1 000-row cap

  if (hErr) {
    console.error("Failed to read mp_portfolio_holdings:", hErr.message);
    console.error("→ Make sure the old archive tables exist (they were NOT deleted).");
    process.exit(1);
  }

  console.log(`Archive rows read: ${holdings?.length ?? 0}`);

  // ── 2. Build anchor map: fund_id → date → [prices] ──────────────────────
  //      Multiple platforms/profiles may supply the same ISIN on the same
  //      date — we average them (they should be near-identical for the
  //      same share class).
  const anchorMap = new Map<string, Map<string, number[]>>();

  for (const h of holdings ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const period = (Array.isArray((h as any).mp_portfolio_periods)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (h as any).mp_portfolio_periods[0]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (h as any).mp_portfolio_periods) as { start_date: string; end_date: string | null; is_open: boolean } | null;

    if (!period || !period.start_date) continue;

    const fid = h.fund_id as string;
    if (!anchorMap.has(fid)) anchorMap.set(fid, new Map());
    const map = anchorMap.get(fid)!;

    const push = (date: string, price: number) => {
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(price);
    };

    // Start anchor
    if (h.initial_price && (h.initial_price as number) > 0) {
      push(period.start_date, h.initial_price as number);
    }

    // End anchor (only for closed periods with a valid end date and price)
    if (!period.is_open && period.end_date && h.final_price && (h.final_price as number) > 0) {
      push(period.end_date, h.final_price as number);
    }
  }

  console.log(`Unique funds with price anchors: ${anchorMap.size}\n`);

  // ── 3. Resolve fund display names ────────────────────────────────────────
  const { data: fundsData } = await db
    .from("mp_funds")
    .select("id, isin, display_name");
  const fundName = (id: string) =>
    fundsData?.find((f) => f.id === id)?.display_name?.slice(0, 35) ?? id;

  // ── 4. Interpolate and upsert ─────────────────────────────────────────────
  let grandTotal = 0;

  for (const [fundId, dateMap] of anchorMap) {
    // Build sorted, deduplicated anchor list (average prices for same date)
    const anchors = [...dateMap.entries()]
      .map(([date, prices]) => ({
        date,
        price: prices.reduce((a, b) => a + b, 0) / prices.length,
      }))
      .filter((a) => a.price > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (anchors.length < 2) continue;

    // Generate interpolated daily prices across all segments
    const pricePoints: Array<{ date: string; price: number }> = [];

    for (let i = 0; i < anchors.length - 1; i++) {
      const segment = interpolate(
        anchors[i].date,   anchors[i].price,
        anchors[i + 1].date, anchors[i + 1].price
      );
      // Exclude the last point of each segment (it becomes the first
      // point of the next) to avoid duplicates — except for the last segment
      const slice = i < anchors.length - 2 ? segment.slice(0, -1) : segment;
      pricePoints.push(...slice);
    }

    if (!pricePoints.length) continue;

    // Upsert — ignoreDuplicates=true means real FT/Yahoo prices are preserved
    const rows = pricePoints.map((p) => ({
      fund_id: fundId,
      date:    p.date,
      price:   p.price,
      source:  "csv_interpolated",
    }));

    let inserted = 0;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await db
        .from("mp_fund_prices")
        .upsert(rows.slice(i, i + CHUNK), {
          onConflict:       "fund_id,date",
          ignoreDuplicates: true, // never overwrite real synced prices
        });
      if (!error) inserted += Math.min(CHUNK, rows.length - i);
    }

    grandTotal += inserted;
    const range = `${anchors[0].date} → ${anchors[anchors.length - 1].date}`;
    console.log(
      `${fundName(fundId).padEnd(37)} ` +
      `${String(anchors.length).padStart(3)} anchors  ` +
      `${String(inserted).padStart(5)} days  [${range}]`
    );
  }

  // ── 5. Summary ────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(70));
  console.log(`✓  Interpolated rows inserted : ${grandTotal.toLocaleString()}`);

  const { data: stats } = await db
    .from("mp_fund_prices")
    .select("date, source")
    .order("date");

  if (stats?.length) {
    const csvRows  = stats.filter((r) => r.source === "csv_interpolated").length;
    const liveRows = stats.filter((r) => r.source === "ft" || r.source === "yahoo" || r.source === "eodhd").length;
    console.log(`   CSV interpolated           : ${csvRows.toLocaleString()}`);
    console.log(`   Live synced prices         : ${liveRows.toLocaleString()}`);
    console.log(`   Total in mp_fund_prices    : ${stats.length.toLocaleString()}`);
    console.log(`   Date range                 : ${stats[0].date} → ${stats[stats.length - 1].date}`);
  }
}

main().catch((err) => {
  console.error("\nFatal:", err.message ?? err);
  process.exit(1);
});
