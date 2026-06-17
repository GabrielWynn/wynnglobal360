/**
 * Portfolio Compositions — server-only
 *
 * The new data model: a "composition" is a set of fund ISINs + weights that
 * is valid from `effective_from` until `effective_to` (null = still active).
 *
 * All performance is calculated from daily NAV prices (FT Markets / Yahoo Finance),
 * not from imported return figures in the CSV.
 */

import { supabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompositionHolding {
  fundId:   string;
  isin:     string;
  fundName: string;
  weight:   number;
}

export interface PortfolioComposition {
  id:            string;
  effectiveFrom: string;   // ISO date "YYYY-MM-DD"
  effectiveTo:   string | null;
  holdings:      CompositionHolding[];
}

export interface DailyReturn {
  date:            string;
  portfolioReturn: number;
  coverage:        number;
}

export interface DailyChartPoint {
  date:            string;
  portfolioReturn: number;   // cumulative from first price date
}

// ---------------------------------------------------------------------------
// Fetch compositions from DB
// ---------------------------------------------------------------------------

export async function fetchCompositions(
  platformId: string,
  profileId:  string
): Promise<PortfolioComposition[]> {
  const { data, error } = await supabaseAdmin
    .from("mp_portfolio_compositions")
    .select(
      `id, effective_from, effective_to,
       mp_composition_holdings(
         weight, fund_id,
         mp_funds(isin, display_name)
       )`
    )
    .eq("platform_id", platformId)
    .eq("profile_id", profileId)
    .order("effective_from");

  if (error) throw new Error(`fetchCompositions: ${error.message}`);

  return (data ?? []).map((c) => ({
    id:            c.id,
    effectiveFrom: c.effective_from,
    effectiveTo:   c.effective_to,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    holdings: (c.mp_composition_holdings ?? []).map((h: any) => {
      const fund = Array.isArray(h.mp_funds) ? h.mp_funds[0] : h.mp_funds;
      return {
        fundId:   h.fund_id  as string,
        isin:     fund?.isin ?? "",
        fundName: fund?.display_name ?? "",
        weight:   h.weight   as number,
      };
    }),
  }));
}

// ---------------------------------------------------------------------------
// Find the composition active on a given date
// ---------------------------------------------------------------------------

export function getCompositionAtDate(
  compositions: PortfolioComposition[],
  date: string
): PortfolioComposition | null {
  // Sort descending so we find the most recent composition first
  const sorted = [...compositions].sort((a, b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom)
  );
  return (
    sorted.find(
      (c) =>
        c.effectiveFrom <= date &&
        (c.effectiveTo === null || c.effectiveTo > date)
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Build daily portfolio return series from compositions + prices
// ---------------------------------------------------------------------------

export function buildDailyReturns(
  compositions: PortfolioComposition[],
  fundPriceRows: Array<{ fund_id: string; date: string; price: number }>
): DailyReturn[] {
  if (!fundPriceRows.length || !compositions.length) return [];

  // price map: fundId → date → price
  const priceMap = new Map<string, Map<string, number>>();
  for (const row of fundPriceRows) {
    if (!priceMap.has(row.fund_id)) priceMap.set(row.fund_id, new Map());
    priceMap.get(row.fund_id)!.set(row.date, row.price);
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Build lookup: date range → weight map
  type Slot = { start: string; end: string; weights: Map<string, number> };
  const slots: Slot[] = compositions
    .slice()
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .map((c) => {
      const weights = new Map<string, number>();
      for (const h of c.holdings) weights.set(h.fundId, h.weight);
      return { start: c.effectiveFrom, end: c.effectiveTo ?? todayStr, weights };
    });

  // Extend the last slot to today if it ended in the past
  if (slots.length) {
    const last = slots[slots.length - 1];
    if (last.end < todayStr) {
      slots.push({ start: last.end, end: todayStr, weights: last.weights });
    }
  }

  function findWeights(date: string): Map<string, number> | null {
    for (const s of slots) if (date >= s.start && date <= s.end) return s.weights;
    return null;
  }

  const allDates = [...new Set(fundPriceRows.map((r) => r.date))].sort();
  const result: DailyReturn[] = [];

  for (let i = 1; i < allDates.length; i++) {
    const cur     = allDates[i];
    const prev    = allDates[i - 1];
    const weights = findWeights(cur);
    if (!weights) continue;

    let ret = 0, cov = 0;
    for (const [fundId, w] of weights) {
      const pC = priceMap.get(fundId)?.get(cur);
      const pP = priceMap.get(fundId)?.get(prev);
      if (pC !== undefined && pP !== undefined && pP > 0) {
        ret += w * (pC / pP - 1);
        cov += w;
      }
    }
    if (cov > 0.1) result.push({ date: cur, portfolioReturn: ret / cov, coverage: cov });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Build cumulative chart series
// ---------------------------------------------------------------------------

export function buildChartSeries(dailyReturns: DailyReturn[]): DailyChartPoint[] {
  let cumulative = 0;
  return dailyReturns.map((d) => {
    cumulative = (1 + cumulative) * (1 + d.portfolioReturn) - 1;
    return { date: d.date, portfolioReturn: cumulative };
  });
}

// ---------------------------------------------------------------------------
// Standard period returns (1M, 3M, 6M, YTD)
// ---------------------------------------------------------------------------

export interface StandardReturns {
  "1M":  number | null;
  "3M":  number | null;
  "6M":  number | null;
  "YTD": number | null;
}

export function computeStandardReturns(dailyReturns: DailyReturn[]): StandardReturns {
  if (!dailyReturns.length) return { "1M": null, "3M": null, "6M": null, "YTD": null };

  const now = new Date();

  function cutoff(monthsAgo: number): string {
    const d = new Date(now);
    d.setMonth(d.getMonth() - monthsAgo);
    return d.toISOString().slice(0, 10);
  }

  function chainFrom(cutoffDate: string): number | null {
    const slice = dailyReturns.filter((d) => d.date > cutoffDate);
    if (!slice.length) return null;
    return slice.reduce((acc, d) => (1 + acc) * (1 + d.portfolioReturn) - 1, 0);
  }

  const ytdCutoff = `${now.getFullYear()}-01-01`;

  return {
    "1M":  chainFrom(cutoff(1)),
    "3M":  chainFrom(cutoff(3)),
    "6M":  chainFrom(cutoff(6)),
    "YTD": chainFrom(ytdCutoff),
  };
}

// ---------------------------------------------------------------------------
// Annual performance — complete calendar years only
// ---------------------------------------------------------------------------

export interface AnnualReturn {
  year:   number;
  return: number;  // decimal e.g. 0.12 = 12%
  days:   number;  // trading days used
}

export function computeAnnualReturns(dailyReturns: DailyReturn[]): AnnualReturn[] {
  if (!dailyReturns.length) return [];

  const currentYear = new Date().getFullYear();
  const results: AnnualReturn[] = [];

  // Determine the range of years in the data
  const firstYear = parseInt(dailyReturns[0].date.slice(0, 4), 10);
  const lastYear  = parseInt(dailyReturns[dailyReturns.length - 1].date.slice(0, 4), 10);

  for (let year = firstYear; year <= lastYear; year++) {
    // Never include the current (partial) year — it shows as YTD
    if (year >= currentYear) break;

    const slice = dailyReturns.filter(
      (d) => d.date >= `${year}-01-01` && d.date <= `${year}-12-31`
    );

    // Require at least 200 trading days for a "complete" year result
    if (slice.length < 200) continue;

    const yearReturn = slice.reduce(
      (acc, d) => (1 + acc) * (1 + d.portfolioReturn) - 1,
      0
    );
    results.push({ year, return: yearReturn, days: slice.length });
  }

  return results;
}
