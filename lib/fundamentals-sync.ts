/**
 * Fetch fund look-through data from the EODHD Fundamentals API and upsert
 * into mp_fund_fundamentals.  Handles both ETF_Data and MutualFund_Data
 * response shapes.
 */

import { supabaseAdmin } from "@/lib/supabase";
import { getFundamentals } from "@/lib/eodhd";
import type { TopHolding } from "@/lib/portfolio-fundamentals";

// ---------------------------------------------------------------------------
// Internal parsing helpers
// ---------------------------------------------------------------------------

function pct(obj: Record<string, string> | undefined, key: string): number {
  const v = parseFloat(obj?.[key] ?? "0");
  return isNaN(v) ? 0 : v;
}

function parseRecordMap(
  data: Record<string, Record<string, string>> | undefined,
  valueKey: string
): Record<string, number> {
  if (!data || typeof data !== "object") return {};
  const out: Record<string, number> = {};
  for (const [label, val] of Object.entries(data)) {
    if (!val || typeof val !== "object") continue;
    const v = pct(val as Record<string, string>, valueKey);
    if (Math.abs(v) > 0.001) out[label] = v;
  }
  return out;
}

interface ParsedFundamentals {
  rawType:         string | null;
  assetAllocation: Record<string, number>;
  worldRegions:    Record<string, number>;
  sectorWeights:   Record<string, number>;
  countryExposure: Record<string, number>;
  topHoldings:     TopHolding[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFundamentals(raw: any): ParsedFundamentals | null {
  const fundData = raw?.ETF_Data ?? raw?.MutualFund_Data;
  if (!fundData) return null;

  const assetAllocation = parseRecordMap(fundData.Asset_Allocation, "Net_Assets_%");
  const worldRegions    = parseRecordMap(fundData.World_Regions,    "Equity_%");
  const sectorWeights   = parseRecordMap(fundData.Sector_Weights,   "Equity_%");
  const countryExposure = parseRecordMap(fundData.Country_Allocation, "Equity_%");

  // Top holdings — EODHD returns an object keyed by ticker symbol
  const holdingsRaw = fundData.Top_10_Holdings ?? fundData.Top_Holdings;
  const topHoldings: TopHolding[] = [];

  if (holdingsRaw && typeof holdingsRaw === "object") {
    for (const val of Object.values(holdingsRaw)) {
      if (!val || typeof val !== "object") continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const h = val as Record<string, any>;
      const w = parseFloat(h["Assets_%"] ?? "0");
      topHoldings.push({
        rank:       0,                        // assigned after sort
        name:       h.Name      ?? "",
        ticker:     h.Code      ?? null,
        sector:     h.Sector    ?? null,
        country:    h.Country   ?? null,
        weight_pct: isNaN(w) ? 0 : w,
      });
    }
    topHoldings.sort((a, b) => b.weight_pct - a.weight_pct);
    topHoldings.forEach((h, i) => { h.rank = i + 1; });
  }

  const hasData =
    Object.keys(assetAllocation).length > 0 ||
    Object.keys(worldRegions).length    > 0 ||
    Object.keys(sectorWeights).length   > 0 ||
    Object.keys(countryExposure).length > 0 ||
    topHoldings.length                  > 0;

  if (!hasData) return null;

  return {
    rawType:  raw?.General?.Type ?? null,
    assetAllocation,
    worldRegions,
    sectorWeights,
    countryExposure,
    topHoldings,
  };
}

// ---------------------------------------------------------------------------
// Public sync function
// ---------------------------------------------------------------------------

export interface FundamentalsSyncResult {
  isin:   string;
  name:   string;
  status: "ok" | "no_ticker" | "no_data" | "error";
  error?: string;
}

export async function syncFundamentals(): Promise<{
  updated:  number;
  skipped:  number;
  errors:   number;
  results:  FundamentalsSyncResult[];
}> {
  // Only process funds that have a resolved EODHD ticker
  const { data: funds } = await supabaseAdmin
    .from("mp_funds")
    .select("id, isin, display_name, eodhd_ticker, eodhd_exchange")
    .not("eodhd_ticker",  "is", null)
    .not("eodhd_exchange", "is", null);

  if (!funds?.length) return { updated: 0, skipped: 0, errors: 0, results: [] };

  const results: FundamentalsSyncResult[] = [];
  let updated = 0, skipped = 0, errors = 0;

  for (const fund of funds) {
    const ticker = `${fund.eodhd_ticker}.${fund.eodhd_exchange}`;
    try {
      const raw = await getFundamentals(ticker);
      if (!raw) {
        results.push({ isin: fund.isin, name: fund.display_name, status: "no_data" });
        skipped++;
        continue;
      }

      const parsed = parseFundamentals(raw);
      if (!parsed) {
        results.push({ isin: fund.isin, name: fund.display_name, status: "no_data" });
        skipped++;
        continue;
      }

      await supabaseAdmin.from("mp_fund_fundamentals").upsert(
        {
          fund_id:          fund.id,
          fetched_at:       new Date().toISOString(),
          raw_type:         parsed.rawType,
          asset_allocation: parsed.assetAllocation,
          world_regions:    parsed.worldRegions,
          sector_weights:   parsed.sectorWeights,
          country_exposure: parsed.countryExposure,
          top_holdings:     parsed.topHoldings,
        },
        { onConflict: "fund_id" }
      );

      results.push({ isin: fund.isin, name: fund.display_name, status: "ok" });
      updated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ isin: fund.isin, name: fund.display_name, status: "error", error: msg });
      errors++;
    }
  }

  return { updated, skipped, errors, results };
}
