import { notFound } from "next/navigation";
import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";
import { supabaseAdmin } from "@/lib/supabase";
import {
  computePeriodReturns,
  computeStandardReturns,
  buildChartSeries,
  type HoldingRow,
} from "@/lib/model-portfolio";
import PerformanceSummaryCards from "@/components/model-portfolio/PerformanceSummaryCards";
import PerformanceChart from "@/components/model-portfolio/PerformanceChart";
import HoldingsTable from "@/components/model-portfolio/HoldingsTable";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageProps {
  params: { platform: string; profile: string };
}

const PROFILE_COLORS: Record<string, string> = {
  A: "#10b981",
  B: "#3b82f6",
  C: "#f59e0b",
  D: "#ef4444",
};

const PROFILE_TABS = ["A", "B", "C", "D"];

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getProfileData(platformSlug: string, profileSlug: string) {
  const profileLabel = profileSlug.toUpperCase();
  if (!PROFILE_TABS.includes(profileLabel)) return null;

  // Platform
  const { data: platform } = await supabaseAdmin
    .from("mp_platforms")
    .select("id, name, slug")
    .eq("slug", platformSlug)
    .maybeSingle();
  if (!platform) return null;

  // Profile
  const { data: profile } = await supabaseAdmin
    .from("mp_risk_profiles")
    .select("id, label, name")
    .eq("label", profileLabel)
    .maybeSingle();
  if (!profile) return null;

  // All periods for this platform + profile (with holdings)
  const { data: rawPeriods } = await supabaseAdmin
    .from("mp_portfolio_periods")
    .select(
      `id, label, start_date, end_date, is_open,
       mp_portfolio_holdings!inner(
         weighted_return, weight, initial_price, final_price, return_pct, fund_id,
         mp_funds(isin, display_name)
       )`
    )
    .eq("platform_id", platform.id)
    .eq("mp_portfolio_holdings.profile_id", profile.id)
    .order("start_date");

  const periods = computePeriodReturns(rawPeriods ?? []);
  const standardReturns = computeStandardReturns(periods);

  // Chart series (no benchmark data yet — populated by cron)
  const chartSeries = buildChartSeries(periods, null);

  // Current holdings — most recent period (open or completed)
  const latestPeriod = [...(rawPeriods ?? [])].reverse()[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentHoldings: HoldingRow[] = (latestPeriod?.mp_portfolio_holdings ?? []).map((h: any) => {
    const fund = Array.isArray(h.mp_funds) ? h.mp_funds[0] : h.mp_funds;
    return {
      fundId:         h.fund_id,
      isin:           fund?.isin ?? "",
      fundName:       fund?.display_name ?? "",
      weight:         h.weight,
      initialPrice:   h.initial_price,
      finalPrice:     h.final_price,
      returnPct:      h.return_pct,
      weightedReturn: h.weighted_return,
    };
  });

  // Benchmarks list
  const { data: benchmarks } = await supabaseAdmin
    .from("mp_benchmarks")
    .select("id, name, ticker");

  // Benchmark prices (from mp_benchmark_prices) — keyed by benchmark id
  const benchmarkPriceMap: Record<
    string,
    Array<{ date: string; price: number }>
  > = {};

  if (benchmarks?.length) {
    for (const bench of benchmarks) {
      const { data: prices } = await supabaseAdmin
        .from("mp_benchmark_prices")
        .select("date, price")
        .eq("benchmark_id", bench.id)
        .order("date");

      if (prices?.length) {
        benchmarkPriceMap[bench.id] = prices;
      }
    }
  }

  return {
    platform,
    profile,
    periods,
    standardReturns,
    chartSeries,
    currentHoldings,
    latestPeriodLabel: latestPeriod?.label ?? "",
    benchmarks: (benchmarks ?? []).map((b) => ({ id: b.id, name: b.name })),
    benchmarkPriceMap,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ProfileDetailPage({ params }: PageProps) {
  const data = await getProfileData(params.platform, params.profile);
  if (!data) notFound();

  const {
    platform,
    profile,
    standardReturns,
    chartSeries,
    currentHoldings,
    latestPeriodLabel,
    benchmarks,
    benchmarkPriceMap,
  } = data;

  const profileColor = PROFILE_COLORS[profile.label] ?? "#64748b";

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 space-y-6">
      {/* Breadcrumb */}
      <div
        className="flex items-center gap-2 text-sm"
        style={{ color: "var(--wgi-text-muted)" }}
      >
        <Link
          href="/model-portfolio"
          className="hover:underline"
          style={{ color: "var(--wgi-accent)" }}
        >
          Model Portfolio
        </Link>
        <span>/</span>
        <Link
          href={`/model-portfolio/${platform.slug}`}
          className="hover:underline"
          style={{ color: "var(--wgi-accent)" }}
        >
          {platform.name}
        </Link>
        <span>/</span>
        <span style={{ color: "var(--wgi-text)" }}>Perfil {profile.label}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold"
              style={{ background: profileColor }}
            >
              {profile.label}
            </span>
            <div>
              <h1
                className="text-2xl font-bold"
                style={{ color: "var(--wgi-text)" }}
              >
                {platform.name} — Perfil {profile.label}
              </h1>
              <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
                {profile.name}
              </p>
            </div>
          </div>
        </div>

        {/* Profile tab switcher */}
        <div
          className="flex rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--wgi-border)" }}
        >
          {PROFILE_TABS.map((label) => {
            const active = label === profile.label;
            return (
              <Link
                key={label}
                href={`/model-portfolio/${platform.slug}/${label.toLowerCase()}`}
                className="px-4 py-2 text-sm font-semibold transition-colors"
                style={{
                  background: active ? profileColor : "white",
                  color:      active ? "white" : "var(--wgi-text-muted)",
                  borderRight:
                    label !== "D" ? "1px solid var(--wgi-border)" : undefined,
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Performance Summary Cards */}
      <PerformanceSummaryCards returns={standardReturns} />

      {/* Performance Chart */}
      <PerformanceChart
        series={chartSeries}
        profileLabel={profile.label}
        benchmarks={benchmarks}
        benchmarkPriceMap={benchmarkPriceMap}
      />

      {/* Holdings Table */}
      <HoldingsTable
        holdings={currentHoldings}
        periodLabel={latestPeriodLabel}
      />
    </div>
  );
}
