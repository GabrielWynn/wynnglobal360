import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import {
  fetchCompositions,
  buildDailyReturns,
  buildChartSeries,
  computeStandardReturns,
  computeAnnualReturns,
} from "@/lib/portfolio-compositions";
import { getPortfolioFundamentals } from "@/lib/portfolio-fundamentals";

import PerformanceSummaryCards from "@/components/model-portfolio/PerformanceSummaryCards";
import InteractiveChart        from "@/components/model-portfolio/InteractiveChart";
import AnnualPerformance       from "@/components/model-portfolio/AnnualPerformance";
import FundamentalsSection     from "@/components/model-portfolio/FundamentalsSection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageProps {
  params: { platform: string; profile: string };
}

const PROFILE_COLORS: Record<string, string> = {
  A: "#10b981", B: "#3b82f6", C: "#f59e0b", D: "#ef4444",
};
const PROFILE_TABS = ["A", "B", "C", "D"];

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getData(platformSlug: string, profileSlug: string) {
  const profileLabel = profileSlug.toUpperCase();
  if (!PROFILE_TABS.includes(profileLabel)) return null;

  const [{ data: platform }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("mp_platforms").select("id, name, slug").eq("slug", platformSlug).maybeSingle(),
    supabaseAdmin.from("mp_risk_profiles").select("id, label, name").eq("label", profileLabel).maybeSingle(),
  ]);
  if (!platform || !profile) return null;

  // Fetch compositions (the new model)
  const compositions = await fetchCompositions(platform.id, profile.id);

  if (!compositions.length) return null;

  // Fund IDs across all compositions
  const fundIds = [...new Set(compositions.flatMap((c) => c.holdings.map((h) => h.fundId)))];

  const thirteenMonthsAgo = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 13);
    return d.toISOString().slice(0, 10);
  })();

  // Paginate the price query to bypass Supabase's server-side max_rows cap.
  // Each page fetches 900 rows; we stop when a page returns fewer than 900.
  const fundPriceRows: Array<{ fund_id: string; date: string; price: number }> = [];
  const PAGE = 900;
  let page = 0;
  while (true) {
    const { data: chunk } = await supabaseAdmin
      .from("mp_fund_prices")
      .select("fund_id, date, price")
      .in("fund_id", fundIds)
      .gte("date", thirteenMonthsAgo)
      .order("date")
      .range(page * PAGE, page * PAGE + PAGE - 1);

    if (!chunk?.length) break;
    fundPriceRows.push(...chunk);
    if (chunk.length < PAGE) break;  // last page
    page++;
  }

  // Build analytics
  const dailyReturns   = buildDailyReturns(compositions, fundPriceRows ?? []);
  const chartSeries    = buildChartSeries(dailyReturns);
  const standardRet    = computeStandardReturns(dailyReturns);
  const annualRet      = computeAnnualReturns(dailyReturns);

  // Portfolio look-through: use the current (most recent active) composition
  const activeComposition =
    compositions.find((c) => c.effectiveTo === null) ??
    compositions[compositions.length - 1];

  const fundamentals = activeComposition
    ? await getPortfolioFundamentals(
        activeComposition.holdings.map((h) => ({ fundId: h.fundId, weight: h.weight }))
      )
    : null;

  return {
    platform,
    profile,
    compositions,
    chartSeries,
    standardRet,
    annualRet,
    fundamentals,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ProfileDetailPage({ params }: PageProps) {
  const data = await getData(params.platform, params.profile);
  if (!data) notFound();

  const { platform, profile, compositions, chartSeries, standardRet, annualRet, fundamentals } = data;
  const profileColor = PROFILE_COLORS[profile.label] ?? "#64748b";

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 space-y-6">

      {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--wgi-text-muted)" }}>
        <Link href="/model-portfolio" className="hover:underline" style={{ color: "var(--wgi-accent)" }}>
          Model Portfolio
        </Link>
        <span>/</span>
        <Link href={`/model-portfolio/${platform.slug}`} className="hover:underline" style={{ color: "var(--wgi-accent)" }}>
          {platform.name}
        </Link>
        <span>/</span>
        <span style={{ color: "var(--wgi-text)" }}>Perfil {profile.label}</span>
      </div>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold"
            style={{ background: profileColor }}
          >
            {profile.label}
          </span>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
              {platform.name} — Perfil {profile.label}
            </h1>
            <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>{profile.name}</p>
          </div>
        </div>

        {/* Profile tabs */}
        <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
          {PROFILE_TABS.map((label) => {
            const active = label === profile.label;
            return (
              <Link
                key={label}
                href={`/model-portfolio/${platform.slug}/${label.toLowerCase()}`}
                className="px-4 py-2 text-sm font-semibold transition-colors"
                style={{
                  background:  active ? profileColor : "white",
                  color:       active ? "white" : "var(--wgi-text-muted)",
                  borderRight: label !== "D" ? "1px solid var(--wgi-border)" : undefined,
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Performance Cards ───────────────────────────────────────────── */}
      <PerformanceSummaryCards returns={standardRet} />

      {/* ── Interactive Chart + Holdings ─────────────────────────────── */}
      <InteractiveChart
        series={chartSeries}
        compositions={compositions}
        profileLabel={profile.label}
        profileColor={profileColor}
      />

      {/* ── Annual Performance ──────────────────────────────────────── */}
      <AnnualPerformance returns={annualRet} />

      {/* ── Portfolio Look-Through ──────────────────────────────────── */}
      {fundamentals && <FundamentalsSection data={fundamentals} />}

      {/* ── Disclaimer ─────────────────────────────────────────────── */}
      <p className="text-xs text-center pb-4" style={{ color: "var(--wgi-text-muted)" }}>
        Past performance is not indicative of future results.
        Returns are calculated from daily closing NAV prices sourced from EODHD.
      </p>
    </div>
  );
}
