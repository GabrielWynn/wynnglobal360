/**
 * analytics.ts — kept for the compare page performance API only.
 * All new code should use lib/portfolio-compositions.ts.
 *
 * Exports only what the compare page currently imports:
 *  - DAILY_MIN_OBSERVATIONS
 *  - DailyChartPoint (type re-export from portfolio-compositions)
 *  - AnnualisedReturns (type — no longer used in profile page but kept for exports)
 */

export const DAILY_MIN_OBSERVATIONS = 30;

// Re-export the types that compare page / export button still reference
export type { DailyChartPoint } from "@/lib/portfolio-compositions";

// AnnualisedReturns is referenced by ExportButton — keep as a stub
export interface AnnualisedReturns {
  "1M":              { raw: number | null };
  "3M":              { raw: number | null };
  "6M":              { raw: number | null };
  "YTD":             { raw: number | null };
  "1Y":              { raw: number | null };
  "2Y":              { raw: number | null; annualised: number | null };
  "Since Inception": { raw: number | null; annualised: number | null; years: number };
}
