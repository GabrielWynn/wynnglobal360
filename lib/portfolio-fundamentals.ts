/**
 * Aggregate fund-level fundamentals into a portfolio-weighted view.
 *
 * Each metric stored per fund (asset allocation, regions, etc.) is in %.
 * We weight each fund's breakdown by its composition weight (0–1 fraction)
 * to produce portfolio-level percentages.
 */

import { supabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Shared types (also imported by fundamentals-sync.ts)
// ---------------------------------------------------------------------------

export interface TopHolding {
  rank:       number;
  name:       string;
  ticker:     string | null;
  sector:     string | null;
  country:    string | null;
  weight_pct: number;
}

export interface PortfolioFundamentals {
  assetAllocation: Array<{ label: string; value: number }>;
  worldRegions:    Array<{ label: string; value: number }>;
  sectorWeights:   Array<{ label: string; value: number }>;
  countryExposure: Array<{ label: string; value: number }>;
  topHoldings:     TopHolding[];
  coverage:        number;   // % of total composition weight that had data
  dataAsOf:        string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function weightedAdd(
  acc: Record<string, number>,
  source: Record<string, number> | null,
  weight: number   // normalised 0–1 fraction of total portfolio
): void {
  if (!source) return;
  for (const [key, pct] of Object.entries(source)) {
    acc[key] = (acc[key] ?? 0) + pct * weight;
  }
}

function toSortedArray(acc: Record<string, number>): Array<{ label: string; value: number }> {
  return Object.entries(acc)
    .map(([label, value]) => ({ label, value: Math.round(value * 10) / 10 }))
    .filter((e) => e.value > 0.05)
    .sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Main aggregation
// ---------------------------------------------------------------------------

export async function getPortfolioFundamentals(
  holdings: Array<{ fundId: string; weight: number }>
): Promise<PortfolioFundamentals | null> {
  if (!holdings.length) return null;

  const fundIds = holdings.map((h) => h.fundId);

  const { data: rows } = await supabaseAdmin
    .from("mp_fund_fundamentals")
    .select("fund_id, asset_allocation, world_regions, sector_weights, country_exposure, top_holdings, fetched_at")
    .in("fund_id", fundIds);

  if (!rows?.length) return null;

  type FundRow = {
    fund_id:          string;
    asset_allocation: Record<string, number> | null;
    world_regions:    Record<string, number> | null;
    sector_weights:   Record<string, number> | null;
    country_exposure: Record<string, number> | null;
    top_holdings:     TopHolding[] | null;
    fetched_at:       string;
  };

  const fundMap = new Map<string, FundRow>(rows.map((r) => [r.fund_id, r as FundRow]));

  // Normalise weights so they sum to 1 (handles minor floating-point drift)
  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);

  const assetAcc:   Record<string, number> = {};
  const regionAcc:  Record<string, number> = {};
  const sectorAcc:  Record<string, number> = {};
  const countryAcc: Record<string, number> = {};

  // Aggregate holdings by name (same stock can appear across multiple funds)
  const holdingAcc = new Map<string, {
    name: string; ticker: string | null; sector: string | null;
    country: string | null; total: number;
  }>();

  let coveredWeight = 0;
  let oldestFetch:  string | null = null;

  for (const h of holdings) {
    const fund = fundMap.get(h.fundId);
    if (!fund) continue;

    const w = h.weight / totalWeight;
    coveredWeight += h.weight;

    if (!oldestFetch || fund.fetched_at < oldestFetch) oldestFetch = fund.fetched_at;

    weightedAdd(assetAcc,   fund.asset_allocation, w);
    weightedAdd(regionAcc,  fund.world_regions,    w);
    weightedAdd(sectorAcc,  fund.sector_weights,   w);
    weightedAdd(countryAcc, fund.country_exposure, w);

    if (fund.top_holdings) {
      for (const holding of fund.top_holdings) {
        const existing = holdingAcc.get(holding.name);
        const contribution = holding.weight_pct * w;
        if (existing) {
          existing.total += contribution;
        } else {
          holdingAcc.set(holding.name, {
            name:    holding.name,
            ticker:  holding.ticker,
            sector:  holding.sector,
            country: holding.country,
            total:   contribution,
          });
        }
      }
    }
  }

  if (coveredWeight === 0) return null;

  const topHoldings: TopHolding[] = [...holdingAcc.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((h, i) => ({
      rank:       i + 1,
      name:       h.name,
      ticker:     h.ticker,
      sector:     h.sector,
      country:    h.country,
      weight_pct: Math.round(h.total * 10) / 10,
    }));

  return {
    assetAllocation: toSortedArray(assetAcc),
    worldRegions:    toSortedArray(regionAcc),
    sectorWeights:   toSortedArray(sectorAcc),
    countryExposure: toSortedArray(countryAcc),
    topHoldings,
    coverage:  Math.round((coveredWeight / totalWeight) * 100),
    dataAsOf:  oldestFetch ? oldestFetch.slice(0, 10) : null,
  };
}
