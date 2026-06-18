import { supabaseAdmin } from "@/lib/supabase";
import { PROFILE_COLORS } from "@/lib/mp-profiles";

type PlatformRow = { id: string; name: string; slug: string };
type ProfileChip = { label: string; risk_level: number };

async function getPlatformProfileMap(): Promise<Map<string, ProfileChip[]>> {
  const { data } = await supabaseAdmin
    .from("mp_portfolio_compositions")
    .select("platform_id, mp_risk_profiles(label, risk_level)");

  const map = new Map<string, Map<string, ProfileChip>>();

  for (const row of data ?? []) {
    const rp = Array.isArray(row.mp_risk_profiles)
      ? row.mp_risk_profiles[0]
      : row.mp_risk_profiles;
    if (!rp?.label) continue;

    const platformId = row.platform_id as string;
    if (!map.has(platformId)) map.set(platformId, new Map());
    map.get(platformId)!.set(rp.label, {
      label: rp.label,
      risk_level: rp.risk_level,
    });
  }

  const result = new Map<string, ProfileChip[]>();
  for (const [platformId, labels] of map) {
    result.set(
      platformId,
      [...labels.values()].sort((a, b) => a.risk_level - b.risk_level)
    );
  }
  return result;
}

export default async function ModelPortfolioPage() {
  const [{ data: platforms }, { data: profiles }, platformProfileMap] =
    await Promise.all([
      supabaseAdmin.from("mp_platforms").select("id, name, slug").order("name"),
      supabaseAdmin
        .from("mp_risk_profiles")
        .select("id, label, name, risk_level")
        .order("risk_level"),
      getPlatformProfileMap(),
    ]);

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-2xl md:text-3xl font-bold"
          style={{ color: "var(--wgi-navy)" }}
        >
          Model Portfolio
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--wgi-text-muted)" }}>
          Historical performance across all platforms and risk profiles
        </p>
      </div>

      {/* Risk profile legend */}
      <div className="flex flex-wrap gap-3 mb-8">
        {(profiles ?? []).map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-white"
            style={{ background: PROFILE_COLORS[p.label] ?? "#64748b" }}
          >
            Perfil {p.label} — {p.name}
          </span>
        ))}
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {(platforms ?? []).map((platform: PlatformRow) => {
          const chips = platformProfileMap.get(platform.id) ?? [];
          return (
            <a
              key={platform.id}
              href={`/model-portfolio/${platform.slug}`}
              className="group block rounded-2xl border p-6 transition-shadow hover:shadow-lg"
              style={{
                background: "white",
                borderColor: "var(--wgi-border)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-lg font-bold"
                  style={{ color: "var(--wgi-navy)" }}
                >
                  {platform.name}
                </span>
                <span
                  className="text-xs font-medium px-2 py-1 rounded-full"
                  style={{
                    background: "var(--wgi-bg)",
                    color: "var(--wgi-text-muted)",
                  }}
                >
                  {chips.length} profile{chips.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {chips.map(({ label }) => (
                  <span
                    key={label}
                    className="min-w-[2.5rem] text-center py-1.5 px-2 rounded-lg text-xs font-bold text-white"
                    style={{ background: PROFILE_COLORS[label] ?? "#64748b" }}
                  >
                    {label}
                  </span>
                ))}
              </div>

              <p className="mt-4 text-xs group-hover:underline mp-text-link">
                View performance →
              </p>
            </a>
          );
        })}
      </div>
    </div>
  );
}
