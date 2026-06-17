/**
 * Apply mp_risk_profiles C+ / D+ rows to linked Supabase (service role).
 * Usage: npx tsx scripts/apply-profile-migration.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const inserts = [
    { label: "C+", name: "Moderate Aggressive Plus", risk_level: 4 },
    { label: "D+", name: "Aggressive Plus", risk_level: 6 },
  ];

  for (const row of inserts) {
    const { error } = await supabase
      .from("mp_risk_profiles")
      .upsert(row, { onConflict: "label" });
    if (error) console.warn(`Upsert ${row.label}:`, error.message);
    else console.log(`Upserted profile ${row.label}`);
  }

  const { error: dErr } = await supabase
    .from("mp_risk_profiles")
    .update({ risk_level: 5 })
    .eq("label", "D");
  if (dErr) console.warn("Update D risk_level:", dErr.message);
  else console.log("Set D risk_level = 5");

  const { data, error } = await supabase
    .from("mp_risk_profiles")
    .select("label, name, risk_level")
    .order("risk_level");

  if (error) throw error;
  console.log("\nProfiles:");
  for (const p of data ?? []) {
    console.log(`  ${p.label} (${p.risk_level}) — ${p.name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
