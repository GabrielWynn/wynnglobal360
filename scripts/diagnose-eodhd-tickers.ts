/**
 * For a sample of our fund ISINs, search EODHD for ALL available exchange codes
 * and test each one for historical price data.
 * This identifies which exchange code actually has historical NAV data.
 *
 * Usage: npx tsx scripts/diagnose-eodhd-tickers.ts
 */

import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const KEY      = process.env.EODHD_API_KEY!;
const BASE_URL = "https://eodhd.com/api";

// Sample ISINs — mix of active and historical funds
const SAMPLE_ISINS = [
  { isin: "IE00B3BRDK12", name: "Canaccord Genuity Opportunity"   }, // active
  { isin: "LU0133082254", name: "T. Rowe Price Global High Yield" }, // active
  { isin: "IE00BQXX3F31", name: "Guinness Global Innovators"      }, // active
  { isin: "LU0049014870", name: "Aberdeen Std Liquidity"          }, // active
  { isin: "LU0853555463", name: "Jupiter Dynamic Bond"            }, // active
  { isin: "LU0070215933", name: "JPM US Bond"                     }, // historical
  { isin: "LU0651986738", name: "Harmony USD Growth"              }, // historical
];

async function searchISIN(isin: string) {
  const url = `${BASE_URL}/search/${isin}?api_token=${KEY}&fmt=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function testHistorical(ticker: string): Promise<number> {
  const from = "2020-01-01";
  const to   = new Date().toISOString().slice(0, 10);
  const url  = `${BASE_URL}/eod/${encodeURIComponent(ticker)}?api_token=${KEY}&fmt=json&from=${from}&to=${to}`;
  const res  = await fetch(url);
  if (!res.ok) return 0;
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

async function main() {
  console.log(`EODHD Ticker Diagnostic\n${"─".repeat(70)}\n`);

  for (const { isin, name } of SAMPLE_ISINS) {
    console.log(`\n${name}`);
    console.log(`ISIN: ${isin}`);

    const results = await searchISIN(isin);

    if (!results.length) {
      console.log("  → No results from EODHD search");
      continue;
    }

    console.log(`  Found ${results.length} result(s):`);

    for (const r of results) {
      const ticker  = `${r.Code}.${r.Exchange}`;
      const rows    = await testHistorical(ticker);
      const status  = rows > 0 ? `✓ ${rows} rows` : "✗ no data";
      console.log(
        `  [${r.Exchange.padEnd(10)}] ${ticker.padEnd(30)} ${r.Type?.padEnd(8) ?? "?".padEnd(8)} ${status}`
      );
    }
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log("Done. Look for exchange codes marked ✓ to find which has historical data.");
}

main().catch(console.error);
