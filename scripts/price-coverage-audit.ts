/**
 * Price coverage audit — CLI report for active portfolio funds.
 *
 * Usage:  npx tsx scripts/price-coverage-audit.ts
 */

import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const { runPriceCoverageAudit } = await import("../lib/price-coverage-audit");
  const audit = await runPriceCoverageAudit();
  const { summary, funds } = audit;

  console.log("\n=== Price Coverage Audit ===");
  console.log(`Audited at:          ${summary.auditedAt}`);
  console.log(`Active funds:        ${summary.activeFunds}`);
  console.log(`OK (recent price):   ${summary.ok}`);
  console.log(`Stale:               ${summary.stale}`);
  console.log(`No prices:           ${summary.empty}`);
  console.log(`No FT/Yahoo symbol:  ${summary.noSource}`);
  console.log(`Yahoo-fed only:      ${summary.yahooOnly}`);
  console.log(`Needs attention:     ${summary.fallbackTargets}`);

  const needsAttention = funds.filter((f) => f.status !== "ok" && f.status !== "yahoo_only");
  if (needsAttention.length) {
    console.log("\n--- Needs attention ---");
    for (const f of needsAttention) {
      console.log(
        `  [${f.status.padEnd(10)}] ${f.isin}  ${f.name.slice(0, 45)}` +
        `  last=${f.lastPrice ?? "—"}  src=${f.lastSource ?? "—"}`
      );
    }
  } else {
    console.log("\nAll active funds have recent price coverage.");
  }
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
