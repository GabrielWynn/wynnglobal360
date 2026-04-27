/**
 * EODHD API client
 * Docs: https://eodhd.com/financial-apis/
 *
 * Used for:
 *  - Searching a fund ticker by ISIN
 *  - Fetching historical EOD prices for a fund or benchmark
 *  - Fetching the latest price for a fund or benchmark
 */

const BASE_URL = "https://eodhd.com/api";

function token() {
  const key = process.env.EODHD_API_KEY;
  if (!key) throw new Error("EODHD_API_KEY is not set");
  return key;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EodhdSearchResult {
  Code: string;
  Exchange: string;
  Name: string;
  Type: string;
  Country: string;
  Currency: string;
  ISIN: string | null;
  previousClose: number | null;
  previousCloseDate: string | null;
}

export interface EodhdEodBar {
  date: string;       // "YYYY-MM-DD"
  open: number;
  high: number;
  low: number;
  close: number;
  adjusted_close: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// Search by ISIN → find the best matching ticker on EODHD
// ---------------------------------------------------------------------------

/**
 * Returns the list of securities matching the given ISIN.
 * EODHD often returns multiple results (same fund on different exchanges).
 * The caller picks the best one.
 */
export async function searchByISIN(isin: string): Promise<EodhdSearchResult[]> {
  const url = `${BASE_URL}/search/${encodeURIComponent(isin)}?api_token=${token()}&fmt=json`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Picks the most appropriate result from a search by preferring:
 *  1. Mutual fund types on major exchanges (F = Frankfurt, PA = Paris, LSE)
 *  2. Exact ISIN match
 */
export function pickBestResult(
  results: EodhdSearchResult[],
  isin: string
): EodhdSearchResult | null {
  if (!results.length) return null;

  // Prefer exact ISIN match
  const exactMatch = results.filter(
    (r) => r.ISIN?.toUpperCase() === isin.toUpperCase()
  );
  const pool = exactMatch.length ? exactMatch : results;

  // Prefer fund-type entries on liquid exchanges
  const preferred = pool.filter((r) =>
    ["FUND", "ETF"].includes(r.Type?.toUpperCase() ?? "")
  );
  return preferred[0] ?? pool[0] ?? null;
}

// ---------------------------------------------------------------------------
// Historical EOD prices
// ---------------------------------------------------------------------------

/**
 * Fetch EOD price history for a ticker.
 * ticker format: "CODE.EXCHANGE"  e.g. "0P0000MXHJ.F"
 * fromDate / toDate: "YYYY-MM-DD"
 */
export async function getHistoricalPrices(
  ticker: string,
  fromDate: string,
  toDate: string
): Promise<EodhdEodBar[]> {
  const url =
    `${BASE_URL}/eod/${encodeURIComponent(ticker)}` +
    `?api_token=${token()}&fmt=json&from=${fromDate}&to=${toDate}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Returns just the most recent price for a ticker.
 * EODHD's /real-time endpoint is used (returns last available close).
 */
export async function getLatestPrice(
  ticker: string
): Promise<{ date: string; price: number } | null> {
  const url =
    `${BASE_URL}/real-time/${encodeURIComponent(ticker)}` +
    `?api_token=${token()}&fmt=json`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || typeof data.close !== "number") return null;
  return {
    date: data.timestamp
      ? new Date(data.timestamp * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    price: data.close,
  };
}

/**
 * Convenience: resolve an ISIN to its EODHD ticker string.
 * Returns null if not found.
 */
export async function resolveISINToTicker(
  isin: string
): Promise<{ ticker: string; exchange: string; name: string } | null> {
  const results = await searchByISIN(isin);
  const best = pickBestResult(results, isin);
  if (!best) return null;
  return {
    ticker: `${best.Code}.${best.Exchange}`,
    exchange: best.Exchange,
    name: best.Name,
  };
}
