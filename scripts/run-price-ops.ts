/**
 * One-shot: daily sync + seed active fund prices (FT → Yahoo).
 * Usage: npx tsx scripts/run-price-ops.ts
 */

import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function seedActiveFunds(): Promise<void> {
  const { supabaseAdmin } = await import("../lib/supabase");
  const { fetchFundPriceHistory } = await import("../lib/fund-price-sources");

  const today = new Date().toISOString().slice(0, 10);

  const { data: raw } = await supabaseAdmin
    .from("mp_composition_holdings")
    .select(`
      fund_id,
      mp_portfolio_compositions!inner(effective_from, effective_to),
      mp_funds!inner(id, isin, display_name, currency, ft_symbol, yahoo_symbol)
    `);

  if (!raw?.length) {
    console.log("Seed: no compositions found");
    return;
  }

  type FundRange = {
    fundId: string;
    isin: string;
    name: string;
    currency: string;
    ft_symbol: string | null;
    yahoo_symbol: string | null;
    from: string;
    to: string;
  };

  const fundMap = new Map<string, FundRange>();

  for (const row of raw) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = (Array.isArray((row as any).mp_portfolio_compositions)
      ? (row as any).mp_portfolio_compositions[0]
      : (row as any).mp_portfolio_compositions) as { effective_from: string; effective_to: string | null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fund = (Array.isArray((row as any).mp_funds)
      ? (row as any).mp_funds[0]
      : (row as any).mp_funds) as {
      id: string; isin: string; display_name: string; currency: string;
      ft_symbol: string | null; yahoo_symbol: string | null;
    };

    if (!comp || !fund) continue;

    const compFrom = comp.effective_from;
    const compStillOn = comp.effective_to === null;
    const compTo = compStillOn ? today : comp.effective_to!;
    const fundId = row.fund_id as string;

    const existing = fundMap.get(fundId);
    if (!existing) {
      fundMap.set(fundId, {
        fundId,
        isin: fund.isin,
        name: fund.display_name,
        currency: fund.currency ?? "USD",
        ft_symbol: fund.ft_symbol,
        yahoo_symbol: fund.yahoo_symbol,
        from: compFrom,
        to: compStillOn ? today : compTo,
      });
    } else {
      if (compFrom < existing.from) existing.from = compFrom;
      if (compStillOn || compTo > existing.to) {
        existing.to = compStillOn ? today : compTo;
      }
    }
  }

  console.log(`\n=== Seed Active Prices (${fundMap.size} funds) ===`);
  let totalInserted = 0;
  let errors = 0;

  for (const range of fundMap.values()) {
    try {
      const bars = await fetchFundPriceHistory(
        {
          id: range.fundId,
          isin: range.isin,
          currency: range.currency,
          ft_symbol: range.ft_symbol,
          yahoo_symbol: range.yahoo_symbol,
        },
        range.from,
        range.to
      );

      if (!bars.length) {
        console.log(`  [skip] ${range.isin} — no data from FT or Yahoo`);
        errors++;
        continue;
      }

      const rows = bars.map((b) => ({
        fund_id: range.fundId,
        date: b.date,
        price: b.price,
        source: b.source,
      }));

      let inserted = 0;
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabaseAdmin
          .from("mp_fund_prices")
          .upsert(rows.slice(i, i + CHUNK), { onConflict: "fund_id,date" });
        if (error) throw new Error(error.message);
        inserted += Math.min(CHUNK, rows.length - i);
      }

      totalInserted += inserted;
      console.log(`  [ok] ${range.isin} — ${inserted} bars (${range.from} → ${range.to})`);
    } catch (err) {
      errors++;
      console.log(`  [err] ${range.isin} — ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  console.log(`Seed done: ${totalInserted} rows inserted, ${errors} fund(s) with issues`);
}

async function main() {
  const { syncPrices } = await import("../lib/price-sync");

  console.log("=== Sync Prices (FT → Yahoo) ===");
  const results = await syncPrices();
  console.log(JSON.stringify(results, null, 2));

  await seedActiveFunds();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
