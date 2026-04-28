/**
 * GET /api/model-portfolio/performance?platform=rl360&profile=a
 *
 * Returns standard period returns + chart series for a given platform+profile.
 * Used by the compare page (client-side fetching) and any future consumers.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  computePeriodReturns,
  computeStandardReturns,
  buildChartSeries,
} from "@/lib/model-portfolio";

export const dynamic = "force-dynamic";

const VALID_PROFILES = ["A", "B", "C", "D"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platformSlug = searchParams.get("platform")?.toLowerCase();
  const profileSlug  = searchParams.get("profile")?.toUpperCase();

  if (!platformSlug || !profileSlug) {
    return NextResponse.json(
      { error: "Missing required params: platform, profile" },
      { status: 400 }
    );
  }

  if (!VALID_PROFILES.includes(profileSlug)) {
    return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
  }

  // Resolve platform
  const { data: platform } = await supabaseAdmin
    .from("mp_platforms")
    .select("id, name, slug")
    .eq("slug", platformSlug)
    .maybeSingle();

  if (!platform) {
    return NextResponse.json({ error: "Platform not found" }, { status: 404 });
  }

  // Resolve profile
  const { data: profile } = await supabaseAdmin
    .from("mp_risk_profiles")
    .select("id, label, name")
    .eq("label", profileSlug)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Periods + holdings
  const { data: rawPeriods, error } = await supabaseAdmin
    .from("mp_portfolio_periods")
    .select(
      `id, label, start_date, end_date, is_open,
       mp_portfolio_holdings!inner(weighted_return)`
    )
    .eq("platform_id", platform.id)
    .eq("mp_portfolio_holdings.profile_id", profile.id)
    .order("start_date");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const periods        = computePeriodReturns(rawPeriods ?? []);
  const standardReturns = computeStandardReturns(periods);
  const chartSeries    = buildChartSeries(periods, null);

  return NextResponse.json({
    platform:      { id: platform.id, name: platform.name, slug: platform.slug },
    profile:       { id: profile.id,  label: profile.label, name: profile.name },
    standardReturns,
    chartSeries,
  });
}
