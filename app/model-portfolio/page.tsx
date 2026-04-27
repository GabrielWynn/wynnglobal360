import { supabaseAdmin } from "@/lib/supabase";

const PROFILE_COLORS: Record<string, string> = {
  A: "#10b981", // emerald
  B: "#3b82f6", // blue
  C: "#f59e0b", // amber
  D: "#ef4444", // red
};

export default async function ModelPortfolioPage() {
  const { data: platforms } = await supabaseAdmin
    .from("mp_platforms")
    .select("id, name, slug")
    .order("name");

  const { data: profiles } = await supabaseAdmin
    .from("mp_risk_profiles")
    .select("id, label, name, risk_level")
    .order("risk_level");

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-2xl md:text-3xl font-bold"
          style={{ color: "var(--wgi-text)" }}
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
        {(platforms ?? []).map((platform) => (
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
                4 profiles
              </span>
            </div>

            <div className="flex gap-2">
              {["A", "B", "C", "D"].map((label) => (
                <span
                  key={label}
                  className="flex-1 text-center py-1.5 rounded-lg text-xs font-bold text-white"
                  style={{ background: PROFILE_COLORS[label] }}
                >
                  {label}
                </span>
              ))}
            </div>

            <p
              className="mt-4 text-xs group-hover:underline"
              style={{ color: "var(--wgi-accent)" }}
            >
              View performance →
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
