/**
 * Fund look-through sync — previously backed by EODHD Fundamentals API.
 * Disabled after removing EODHD (no EU fund coverage on that provider).
 */

export interface FundamentalsSyncResults {
  updated: number;
  skipped: number;
  errors:  number;
  message: string;
}

export async function syncFundamentals(): Promise<FundamentalsSyncResults> {
  return {
    updated: 0,
    skipped: 0,
    errors:  0,
    message:
      "Look-through sync is unavailable: EODHD was removed from this project. " +
      "Existing mp_fund_fundamentals rows are preserved; choose a new provider to refresh.",
  };
}
