/**
 * Diagnose performance/chart data for a platform+profile.
 * Usage: npx tsx scripts/diagnose-mp-performance.ts open-architecture-port C
 */
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const {
    fetchCompositions,
    buildDailyReturns,
    buildChartSeries,
    computeAnnualReturns,
    computeStandardReturns,
  } = await import("../lib/portfolio-compositions");

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const platformSlug = process.argv[2] ?? "open-architecture-port";
  const profileLabel = process.argv[3] ?? "C";

  const { data: platform } = await db
    .from("mp_platforms")
    .select("id, name")
    .eq("slug", platformSlug)
    .maybeSingle();
  const { data: profile } = await db
    .from("mp_risk_profiles")
    .select("id, label")
    .eq("label", profileLabel)
    .maybeSingle();

  if (!platform || !profile) {
    console.log("Platform or profile not found");
    return;
  }

  const compositions = await fetchCompositions(platform.id, profile.id);
  console.log(`\n=== ${platform.name} Perfil ${profile.label} ===`);
  console.log("Composition versions:", compositions.length);
  for (const c of compositions) {
    console.log(
      `  ${c.effectiveFrom} -> ${c.effectiveTo ?? "OPEN"} | ${c.holdings.length} funds`
    );
    for (const h of c.holdings) {
      console.log(`    ${h.isin} ${(h.weight * 100).toFixed(0)}%`);
    }
  }

  const fundIds = [...new Set(compositions.flatMap((c) => c.holdings.map((h) => h.fundId)))];
  const earliestFrom = compositions.reduce(
    (min, c) => (c.effectiveFrom < min ? c.effectiveFrom : min),
    compositions[0].effectiveFrom
  );

  const fundPriceRows: Array<{ fund_id: string; date: string; price: number }> = [];
  const PAGE = 900;
  let page = 0;
  while (true) {
    const { data: chunk } = await db
      .from("mp_fund_prices")
      .select("fund_id, date, price")
      .in("fund_id", fundIds)
      .gte("date", earliestFrom)
      .order("date")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (!chunk?.length) break;
    fundPriceRows.push(...chunk);
    if (chunk.length < PAGE) break;
    page++;
  }

  console.log("\nPrice rows loaded:", fundPriceRows.length);
  if (fundPriceRows.length) {
    console.log(
      "Date range:",
      fundPriceRows[0]?.date,
      "->",
      fundPriceRows[fundPriceRows.length - 1]?.date
    );
  }

  const pricesByFund = new Map<string, number>();
  for (const id of fundIds) {
    pricesByFund.set(id, fundPriceRows.filter((r) => r.fund_id === id).length);
  }
  console.log("\nPrice coverage per fund (all versions):");
  const seen = new Set<string>();
  for (const c of compositions) {
    for (const h of c.holdings) {
      if (seen.has(h.fundId)) continue;
      seen.add(h.fundId);
      console.log(`  ${h.isin}: ${pricesByFund.get(h.fundId) ?? 0} rows`);
    }
  }

  const daily = buildDailyReturns(compositions, fundPriceRows);
  const chart = buildChartSeries(daily);
  const annual = computeAnnualReturns(daily);
  const std = computeStandardReturns(daily);

  console.log("\nDaily return points:", daily.length);
  console.log("Chart points:", chart.length);
  console.log("Standard returns:", std);
  console.log(
    "Annual returns:",
    annual.length
      ? annual
      : "(none — need 200+ trading days in a complete prior calendar year)"
  );

  if (daily.length) {
    const byYear = new Map<number, number>();
    for (const d of daily) {
      const y = parseInt(d.date.slice(0, 4), 10);
      byYear.set(y, (byYear.get(y) ?? 0) + 1);
    }
    console.log("\nTrading days per year in daily series:");
    for (const [y, n] of [...byYear.entries()].sort()) {
      console.log(`  ${y}: ${n} days${n < 200 ? " (below 200 threshold for annual)" : ""}`);
    }
  } else {
    console.log("\nNO DAILY RETURNS — chart and annual performance will be empty.");
    console.log("Run Admin -> Seed Active Prices to backfill NAV history.");
  }

  const versionDates = compositions.map((c) => c.effectiveFrom);
  console.log("\nComposition change dates:", versionDates.join(", "));
}

main().catch(console.error);
