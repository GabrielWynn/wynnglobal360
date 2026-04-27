import { notFound } from "next/navigation";
import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";
import { supabaseAdmin } from "@/lib/supabase";
import {
  computePeriodReturns,
  computeStandardReturns,
  formatReturn,
  returnColor,
} from "@/lib/model-portfolio";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageProps {
  params: { platform: string };
}

// ---------------------------------------------------------------------------
// Profile styling
// ---------------------------------------------------------------------------

const PROFILE_META: Record<
  string,
  { color: string; bg: string; desc: string }
> = {
  A: { color: "#10b981", bg: "#ecfdf5", desc: "Conservative" },
  B: { color: "#3b82f6", bg: "#eff6ff", desc: "Moderate" },
  C: { color: "#f59e0b", bg: "#fffbeb", desc: "Moderate Aggressive" },
  D: { color: "#ef4444", bg: "#fef2f2", desc: "Aggressive" },
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getPlatformData(slug: string) {
  const { data: platform } = await supabaseAdmin
    .from("mp_platforms")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!platform) return null;

  const { data: profiles } = await supabaseAdmin
    .from("mp_risk_profiles")
    .select("id, label, name, risk_level")
    .order("risk_level");

  // For each profile, compute since-inception return
  const profileSummaries = await Promise.all(
    (profiles ?? []).map(async (profile) => {
      const { data: periods } = await supabaseAdmin
        .from("mp_portfolio_periods")
        .select(
          `id, label, start_date, end_date, is_open,
           mp_portfolio_holdings!inner(weighted_return)`
        )
        .eq("platform_id", platform.id)
        .eq("mp_portfolio_holdings.profile_id", profile.id)
        .order("start_date");

      const computed = computePeriodReturns(periods ?? []);
      const std = computeStandardReturns(computed);
      const latestCompleted = [...computed]
        .reverse()
        .find((p) => !p.isOpen);

      return {
        ...profile,
        sinceInception: std["Since Inception"],
        latestReturn:   latestCompleted?.portfolioReturn ?? null,
        periodCount:    computed.filter((p) => !p.isOpen).length,
      };
    })
  );

  return { platform, profileSummaries };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PlatformPage({ params }: PageProps) {
  const data = await getPlatformData(params.platform);
  if (!data) notFound();

  const { platform, profileSummaries } = data;

  return (
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
      {/* Breadcrumb */}
      <Link
        href="/model-portfolio"
        className="inline-flex items-center gap-1 text-sm mb-6 transition-opacity hover:opacity-70"
        style={{ color: "var(--wgi-accent)" }}
      >
        <IconChevronLeft size={15} />
        All Platforms
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-2xl md:text-3xl font-bold"
          style={{ color: "var(--wgi-text)" }}
        >
          {platform.name}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--wgi-text-muted)" }}>
          Select a risk profile to view detailed performance
        </p>
      </div>

      {/* Profile cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {profileSummaries.map((profile) => {
          const meta = PROFILE_META[profile.label] ?? {
            color: "#64748b",
            bg: "#f8fafc",
            desc: profile.name,
          };

          return (
            <Link
              key={profile.id}
              href={`/model-portfolio/${platform.slug}/${profile.label.toLowerCase()}`}
              className="group block rounded-2xl border p-6 transition-all hover:shadow-md"
              style={{
                background: "white",
                borderColor: "var(--wgi-border)",
              }}
            >
              {/* Profile badge + label */}
              <div className="flex items-center gap-3 mb-5">
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
                  style={{ background: meta.color }}
                >
                  {profile.label}
                </span>
                <div>
                  <p
                    className="font-semibold text-base"
                    style={{ color: "var(--wgi-text)" }}
                  >
                    Perfil {profile.label}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "var(--wgi-text-muted)" }}
                  >
                    {meta.desc}
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-4">
                <div
                  className="rounded-xl p-3"
                  style={{ background: meta.bg }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: meta.color }}
                  >
                    Since Inception
                  </p>
                  <p
                    className="text-xl font-bold"
                    style={{
                      color: returnColor(profile.sinceInception),
                    }}
                  >
                    {formatReturn(profile.sinceInception)}
                  </p>
                </div>

                <div
                  className="rounded-xl p-3"
                  style={{ background: "var(--wgi-bg)" }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--wgi-text-muted)" }}
                  >
                    Latest Period
                  </p>
                  <p
                    className="text-xl font-bold"
                    style={{
                      color: returnColor(profile.latestReturn),
                    }}
                  >
                    {formatReturn(profile.latestReturn)}
                  </p>
                </div>
              </div>

              {/* Periods count + CTA */}
              <div className="flex items-center justify-between mt-4">
                <span
                  className="text-xs"
                  style={{ color: "var(--wgi-text-muted)" }}
                >
                  {profile.periodCount} completed periods
                </span>
                <span
                  className="text-xs font-medium group-hover:underline"
                  style={{ color: "var(--wgi-accent)" }}
                >
                  View details →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
