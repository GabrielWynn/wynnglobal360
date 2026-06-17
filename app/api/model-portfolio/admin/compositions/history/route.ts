/**
 * GET /api/model-portfolio/admin/compositions/history?profile=<id>
 *
 * Returns all compositions for a given risk profile across every platform,
 * ordered oldest-first within each platform.  Used by the PortfolioHistoryView.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profile");

  if (!profileId) {
    return NextResponse.json({ error: "Missing profile param" }, { status: 400 });
  }

  const [platformsRes, compsRes] = await Promise.all([
    supabaseAdmin.from("mp_platforms").select("id, name, slug").order("name"),
    supabaseAdmin
      .from("mp_portfolio_compositions")
      .select(`
        id, effective_from, effective_to, notes,
        platform_id,
        mp_platforms(id, name, slug),
        mp_composition_holdings(
          id, weight, fund_id,
          mp_funds(isin, display_name)
        )
      `)
      .eq("profile_id", profileId)
      .order("effective_from"),
  ]);

  if (platformsRes.error) {
    return NextResponse.json({ error: platformsRes.error.message }, { status: 500 });
  }
  if (compsRes.error) {
    return NextResponse.json({ error: compsRes.error.message }, { status: 500 });
  }

  // Seed every platform so new life companies appear before first composition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byPlatform: Record<string, { platform: any; compositions: any[] }> = {};
  for (const plat of platformsRes.data ?? []) {
    byPlatform[plat.id] = { platform: plat, compositions: [] };
  }

  for (const comp of compsRes.data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plat = (comp as any).mp_platforms as { id: string; name: string; slug: string };
    if (!plat) continue;
    if (!byPlatform[plat.id]) {
      byPlatform[plat.id] = { platform: plat, compositions: [] };
    }
    byPlatform[plat.id].compositions.push(comp);
  }

  return NextResponse.json(Object.values(byPlatform));
}
