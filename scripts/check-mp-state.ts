import * as dotenv from "dotenv";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: platforms } = await db
    .from("mp_platforms")
    .select("slug, name, created_at")
    .order("created_at", { ascending: false });

  console.log("=== PLATFORMS ===", platforms?.length ?? 0);
  for (const p of platforms ?? []) {
    console.log(`  ${p.slug} | ${p.name} | ${p.created_at?.slice(0, 10)}`);
  }

  const { data: compCounts } = await db
    .from("mp_portfolio_compositions")
    .select("platform_id, mp_platforms(slug), mp_risk_profiles(label)");

  const byPlatform = new Map<string, Set<string>>();
  for (const row of compCounts ?? []) {
    const plat = Array.isArray(row.mp_platforms)
      ? row.mp_platforms[0]
      : row.mp_platforms;
    const prof = Array.isArray(row.mp_risk_profiles)
      ? row.mp_risk_profiles[0]
      : row.mp_risk_profiles;
    if (!plat?.slug || !prof?.label) continue;
    if (!byPlatform.has(plat.slug)) byPlatform.set(plat.slug, new Set());
    byPlatform.get(plat.slug)!.add(prof.label);
  }

  console.log("\n=== PROFILES WITH COMPOSITIONS ===");
  for (const p of platforms ?? []) {
    const profiles = [...(byPlatform.get(p.slug) ?? [])].sort();
    console.log(`  ${p.slug}: ${profiles.length ? profiles.join(", ") : "(none)"}`);
  }

  const { data: recent } = await db
    .from("mp_portfolio_compositions")
    .select(
      "effective_from, effective_to, created_at, mp_platforms(slug), mp_risk_profiles(label)"
    )
    .order("created_at", { ascending: false })
    .limit(8);

  console.log("\n=== RECENT COMPOSITIONS ===");
  for (const c of recent ?? []) {
    const plat = Array.isArray(c.mp_platforms) ? c.mp_platforms[0] : c.mp_platforms;
    const prof = Array.isArray(c.mp_risk_profiles)
      ? c.mp_risk_profiles[0]
      : c.mp_risk_profiles;
    console.log(
      `  ${plat?.slug} Perfil ${prof?.label} | ${c.effective_from} -> ${c.effective_to ?? "OPEN"} | created ${c.created_at?.slice(0, 10)}`
    );
  }

  const { data: openMissing } = await db
    .from("mp_platforms")
    .select("slug, name, mp_portfolio_compositions(id, effective_to)")
    .order("name");

  console.log("\n=== PLATFORMS WITHOUT OPEN COMPOSITION ===");
  for (const p of openMissing ?? []) {
    const comps = (p.mp_portfolio_compositions ?? []) as Array<{ effective_to: string | null }>;
    if (!comps.length) {
      console.log(`  ${p.slug}: NO compositions at all`);
      continue;
    }
    const hasOpen = comps.some((c) => c.effective_to === null);
    if (!hasOpen) console.log(`  ${p.slug}: has compositions but ALL closed`);
  }

  const { data: oap } = await db
    .from("mp_platforms")
    .select("id, slug")
    .eq("slug", "open-architecture-port")
    .maybeSingle();
  if (oap) {
    const { data: oapComps } = await db
      .from("mp_portfolio_compositions")
      .select("id, effective_from, effective_to, mp_risk_profiles(label), mp_composition_holdings(id)")
      .eq("platform_id", oap.id);
    console.log("\n=== open-architecture-port DETAIL ===");
    for (const c of oapComps ?? []) {
      const prof = Array.isArray(c.mp_risk_profiles)
        ? c.mp_risk_profiles[0]
        : c.mp_risk_profiles;
      const holdings = c.mp_composition_holdings ?? [];
      console.log(
        `  Perfil ${prof?.label}: ${c.effective_from} -> ${c.effective_to ?? "OPEN"}, holdings=${holdings.length}`
      );
    }
  }
}

main().catch(console.error);
