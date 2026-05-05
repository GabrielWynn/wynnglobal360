/**
 * Migration: mp_portfolio_periods + mp_portfolio_holdings
 *            → mp_portfolio_compositions + mp_composition_holdings
 *
 * Usage:  npx tsx scripts/migrate-to-compositions.ts
 *
 * What it does:
 *  1. Reads every (platform, profile) combination from existing period data.
 *  2. Deduplicates consecutive periods with identical fund/weight sets.
 *  3. Inserts clean compositions into the new tables.
 *
 * The old tables are NOT touched — they remain as a historical archive.
 * Safe to re-run (upserts everywhere).
 */

import * as path from "path";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HoldingRow { fund_id: string; weight: number }

function holdingsMatch(a: HoldingRow[], b: HoldingRow[]): boolean {
  if (a.length !== b.length) return false;
  const mapA = new Map(a.map((h) => [h.fund_id, h.weight]));
  return b.every((h) => {
    const w = mapA.get(h.fund_id);
    return w !== undefined && Math.abs(w - h.weight) < 0.00001;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Fetch all platforms and profiles
  const [{ data: platforms }, { data: profiles }] = await Promise.all([
    db.from("mp_platforms").select("id, name, slug"),
    db.from("mp_risk_profiles").select("id, label"),
  ]);

  let compositionsCreated = 0;
  let holdingsCreated     = 0;

  for (const plat of platforms ?? []) {
    for (const prof of profiles ?? []) {
      // Fetch all periods for this platform, with holdings filtered to this profile
      const { data: rawPeriods, error } = await db
        .from("mp_portfolio_periods")
        .select(
          "id, start_date, end_date, is_open, " +
          "mp_portfolio_holdings!inner(fund_id, weight)"
        )
        .eq("platform_id", plat.id)
        .eq("mp_portfolio_holdings.profile_id", prof.id)
        .order("start_date");

      if (error || !rawPeriods?.length) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const periods = rawPeriods as any[];

      // Build de-duplicated composition list
      type Slice = { from: string; to: string | null; holdings: HoldingRow[] };
      const slices: Slice[] = [];

      for (let i = 0; i < periods.length; i++) {
        const period   = periods[i];
        const holdings = (period.mp_portfolio_holdings ?? []).map((h: { fund_id: string; weight: number }) => ({
          fund_id: h.fund_id,
          weight:  h.weight,
        }));

        if (!holdings.length) continue;

        const nextStart = periods[i + 1]?.start_date ?? null;

        // Skip if identical to the previous slice (deduplication)
        const prev = slices[slices.length - 1];
        if (prev && holdingsMatch(prev.holdings, holdings)) {
          prev.to = nextStart; // extend the existing slice
          continue;
        }

        slices.push({
          from:     period.start_date,
          to:       nextStart,
          holdings,
        });
      }

      // Upsert compositions
      for (const slice of slices) {
        const { data: comp, error: compErr } = await db
          .from("mp_portfolio_compositions")
          .upsert(
            {
              platform_id:    plat.id,
              profile_id:     prof.id,
              effective_from: slice.from,
              effective_to:   slice.to,
            },
            { onConflict: "platform_id,profile_id,effective_from" }
          )
          .select("id")
          .maybeSingle();

        if (compErr || !comp) {
          console.error(`Composition upsert failed (${plat.slug}/${prof.label}):`, compErr?.message);
          continue;
        }

        // Upsert holdings for this composition
        const holdingRows = slice.holdings.map((h) => ({
          composition_id: comp.id,
          fund_id:        h.fund_id,
          weight:         h.weight,
        }));

        const { error: holdErr } = await db
          .from("mp_composition_holdings")
          .upsert(holdingRows, { onConflict: "composition_id,fund_id" });

        if (holdErr) {
          console.error(`Holdings upsert failed (${plat.slug}/${prof.label}):`, holdErr.message);
        } else {
          compositionsCreated++;
          holdingsCreated += holdingRows.length;
        }
      }

      console.log(
        `${plat.name.padEnd(14)} Perfil ${prof.label} → ${slices.length} compositions`
      );
    }
  }

  console.log(`\n✓ Migration complete`);
  console.log(`  Compositions: ${compositionsCreated}`);
  console.log(`  Holdings:     ${holdingsCreated}`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
