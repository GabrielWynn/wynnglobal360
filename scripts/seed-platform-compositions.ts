/**
 * Bulk-import model portfolio compositions for a life company from CSV.
 *
 * CSV columns (header required):
 *   platform_slug, profile, isin, fund_name, weight_pct, effective_from
 *
 * Example:
 *   new-life-co,A,LU0905233846,BlackRock Global Funds,25,2026-01-01
 *
 * Usage:
 *   npx tsx scripts/seed-platform-compositions.ts scripts/data/new-life-co-compositions.csv
 *   npx tsx scripts/seed-platform-compositions.ts scripts/data/new-life-co-compositions.csv --dry-run
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

interface CsvRow {
  platform_slug: string;
  profile: string;
  isin: string;
  fund_name: string;
  weight_pct: string;
  effective_from: string;
}

interface HoldingInput {
  isin: string;
  fundName: string;
  weight: number;
}

interface CompositionGroup {
  platformSlug: string;
  profileLabel: string;
  effectiveFrom: string;
  holdings: HoldingInput[];
}

function normalizeProfile(raw: string): string {
  const label = raw.trim().toUpperCase();
  if (!/^(A|B|C|C\+|D|D\+)$/.test(label)) {
    throw new Error(`Invalid profile "${raw}" — use A, B, C, C+, D, or D+`);
  }
  return label;
}

function parseWeight(raw: string): number {
  const n = Number(String(raw).replace("%", "").trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid weight "${raw}"`);
  return n > 1 ? n / 100 : n;
}

function groupRows(rows: CsvRow[]): CompositionGroup[] {
  const map = new Map<string, CompositionGroup>();

  for (const row of rows) {
    const platformSlug = row.platform_slug?.trim().toLowerCase();
    const profileLabel = normalizeProfile(row.profile ?? "");
    const isin         = row.isin?.trim().toUpperCase();
    const fundName     = row.fund_name?.trim();
    const effectiveFrom = row.effective_from?.trim();
    const weight       = parseWeight(row.weight_pct ?? "");

    if (!platformSlug || !isin || !fundName || !effectiveFrom) continue;

    const key = `${platformSlug}|${profileLabel}|${effectiveFrom}`;
    if (!map.has(key)) {
      map.set(key, { platformSlug, profileLabel, effectiveFrom, holdings: [] });
    }
    map.get(key)!.holdings.push({ isin, fundName, weight });
  }

  return [...map.values()];
}

async function ensureFund(isin: string, displayName: string, dryRun: boolean): Promise<string> {
  const { data: existing } = await supabase
    .from("mp_funds")
    .select("id")
    .eq("isin", isin)
    .maybeSingle();

  if (existing?.id) return existing.id;

  if (dryRun) {
    console.log(`  [dry-run] would register fund ${isin} — ${displayName}`);
    return `dry-run-${isin}`;
  }

  const { data, error } = await supabase
    .from("mp_funds")
    .insert({ isin, display_name: displayName, currency: "USD" })
    .select("id")
    .maybeSingle();

  if (error || !data) throw new Error(`Fund insert failed for ${isin}: ${error?.message}`);
  return data.id;
}

async function upsertComposition(
  platformId: string,
  profileId: string,
  group: CompositionGroup,
  dryRun: boolean
): Promise<void> {
  const weightSum = group.holdings.reduce((s, h) => s + h.weight, 0);
  if (Math.abs(weightSum - 1) > 0.0001) {
    throw new Error(
      `${group.platformSlug} / ${group.profileLabel} @ ${group.effectiveFrom}: weights sum to ${(weightSum * 100).toFixed(2)}%, expected 100%`
    );
  }

  if (dryRun) {
    console.log(
      `  [dry-run] ${group.platformSlug} Perfil ${group.profileLabel} @ ${group.effectiveFrom} — ${group.holdings.length} holdings`
    );
    return;
  }

  const { data: prev } = await supabase
    .from("mp_portfolio_compositions")
    .select("id")
    .eq("platform_id", platformId)
    .eq("profile_id", profileId)
    .is("effective_to", null)
    .maybeSingle();

  if (prev) {
    await supabase
      .from("mp_portfolio_compositions")
      .update({ effective_to: group.effectiveFrom })
      .eq("id", prev.id);
  }

  const { data: comp, error: compErr } = await supabase
    .from("mp_portfolio_compositions")
    .insert({
      platform_id: platformId,
      profile_id: profileId,
      effective_from: group.effectiveFrom,
      notes: "Imported via seed-platform-compositions.ts",
    })
    .select("id")
    .maybeSingle();

  if (compErr || !comp) {
    throw new Error(`Composition insert failed: ${compErr?.message}`);
  }

  const holdingRows = [];
  for (const h of group.holdings) {
    const fundId = await ensureFund(h.isin, h.fundName, false);
    holdingRows.push({
      composition_id: comp.id,
      fund_id: fundId,
      weight: h.weight,
    });
  }

  const { error: holdErr } = await supabase.from("mp_composition_holdings").insert(holdingRows);
  if (holdErr) throw new Error(`Holdings insert failed: ${holdErr.message}`);
}

async function main() {
  const csvPath = process.argv[2];
  const dryRun  = process.argv.includes("--dry-run");

  if (!csvPath) {
    console.error("Usage: npx tsx scripts/seed-platform-compositions.ts <csv-file> [--dry-run]");
    process.exit(1);
  }

  const absPath = path.resolve(csvPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(absPath, "utf-8");
  const { data: rows, errors } = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length) {
    console.warn("Parse warnings:", errors.slice(0, 3));
  }

  const groups = groupRows(rows ?? []);
  if (!groups.length) {
    console.error("No valid rows found. Check CSV headers and data.");
    process.exit(1);
  }

  const [{ data: platforms }, { data: profiles }] = await Promise.all([
    supabase.from("mp_platforms").select("id, slug"),
    supabase.from("mp_risk_profiles").select("id, label"),
  ]);

  const platformBySlug = Object.fromEntries((platforms ?? []).map((p) => [p.slug, p.id]));
  const profileByLabel = Object.fromEntries((profiles ?? []).map((p) => [p.label, p.id]));

  console.log(`${dryRun ? "[DRY RUN] " : ""}Importing ${groups.length} composition(s) from ${path.basename(absPath)}`);

  for (const group of groups) {
    const platformId = platformBySlug[group.platformSlug];
    if (!platformId) {
      throw new Error(`Unknown platform slug "${group.platformSlug}" — create it in admin or mp_platforms first`);
    }

    const profileId = profileByLabel[group.profileLabel];
    if (!profileId) {
      throw new Error(`Unknown profile "${group.profileLabel}" — run migration for C+/D+ if needed`);
    }

    console.log(`→ ${group.platformSlug} Perfil ${group.profileLabel} @ ${group.effectiveFrom}`);
    await upsertComposition(platformId, profileId, group, dryRun);
  }

  console.log("Done.");
  if (!dryRun) {
    console.log("Next: npx tsx scripts/run-price-ops.ts");
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
