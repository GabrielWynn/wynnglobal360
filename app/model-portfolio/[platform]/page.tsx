import { notFound } from "next/navigation";
import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";
import { supabaseAdmin } from "@/lib/supabase";
import {
  fetchCompositions,
  buildDailyReturns,
  computeStandardReturns,
} from "@/lib/portfolio-compositions";
import { PROFILE_META, profileToSlug } from "@/lib/mp-profiles";

interface PageProps {
  params: { platform: string };
}

function fmt(v: number | null): string {
  if (v === null) return "—";
  const p = (v * 100).toFixed(2);
  return v >= 0 ? `+${p}%` : `${p}%`;
}

function color(v: number | null): string {
  if (v === null) return "var(--wgi-text-muted)";
  return v >= 0 ? "var(--mp-gain, #00873E)" : "var(--mp-loss, #CC0000)";
}

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

  // Batch: single price query for all funds across all profiles
  const { data: allCompositions } = await supabaseAdmin
    .from("mp_portfolio_compositions")
    .select("id, profile_id, effective_from, effective_to, mp_composition_holdings(fund_id, weight, mp_funds(isin, display_name))")
    .eq("platform_id", platform.id);

  const fundIds = [
    ...new Set(
      (allCompositions ?? []).flatMap((c) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c.mp_composition_holdings ?? []).map((h: any) => h.fund_id as string)
      )
    ),
  ];

  const thirteenMonthsAgo = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 13);
    return d.toISOString().slice(0, 10);
  })();

  // Paginated price fetch — bypasses Supabase server-side max_rows cap
  const priceRows: Array<{ fund_id: string; date: string; price: number }> = [];
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
    priceRows.push(...chunk);
    if (chunk.length < PAGE) break;
    page++;
  }

  const profileIdsWithCompositions = new Set(
    (allCompositions ?? []).map((c) => c.profile_id as string)
  );

  const activeProfiles = (profiles ?? []).filter((p) =>
    profileIdsWithCompositions.has(p.id)
  );

  const profileSummaries = await Promise.all(
    activeProfiles.map(async (prof) => {
      const compositions = await fetchCompositions(platform.id, prof.id);
      const daily        = buildDailyReturns(compositions, priceRows ?? []);
      const std          = computeStandardReturns(daily);
      return { ...prof, returns: std };
    })
  );

  return { platform, profileSummaries };
}

export default async function PlatformPage({ params }: PageProps) {
  const data = await getPlatformData(params.platform);
  if (!data) notFound();

  const { platform, profileSummaries } = data;

  return (
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
      <Link
        href="/model-portfolio"
        className="inline-flex items-center gap-1 text-sm mb-6 transition-opacity hover:opacity-70 mp-text-link"
      >
        <IconChevronLeft size={15} />
        All Platforms
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "var(--wgi-text)" }}>
          {platform.name}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--wgi-text-muted)" }}>
          Select a risk profile to view detailed performance
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {profileSummaries.map((prof) => {
          const meta = PROFILE_META[prof.label] ?? { color: "#64748b", bg: "#f8fafc", desc: prof.name };
          return (
            <Link
              key={prof.id}
              href={`/model-portfolio/${platform.slug}/${profileToSlug(prof.label)}`}
              className="group block rounded-2xl border p-6 transition-all hover:shadow-md"
              style={{ background: "white", borderColor: "var(--wgi-border)" }}
            >
              <div className="flex items-center gap-3 mb-5">
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ background: meta.bg, color: meta.color, border: "1px solid var(--wgi-border)" }}
                >
                  {prof.label}
                </span>
                <div>
                  <p className="font-semibold text-base" style={{ color: "var(--wgi-text)" }}>
                    Perfil {prof.label}
                  </p>
                  <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>{meta.desc}</p>
                </div>
              </div>

              {/* 1M / 3M / YTD quick stats */}
              <div className="grid grid-cols-3 gap-3">
                {(["1M", "3M", "YTD"] as const).map((k) => (
                  <div key={k} className="rounded-xl p-3" style={{ background: meta.bg }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1"
                       style={{ color: meta.color }}>
                      {k}
                    </p>
                    <p className="text-lg font-bold" style={{ color: color(prof.returns[k]) }}>
                      {fmt(prof.returns[k])}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-xs group-hover:underline mp-text-link">
                View details →
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
