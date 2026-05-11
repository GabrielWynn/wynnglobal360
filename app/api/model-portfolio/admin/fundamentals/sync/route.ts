/**
 * POST /api/model-portfolio/admin/fundamentals/sync
 *
 * Fetches look-through data (asset allocation, world regions, sectors,
 * country exposure, top holdings) from the EODHD Fundamentals API for
 * every fund that has a resolved ticker, then upserts into mp_fund_fundamentals.
 *
 * Requires an active authenticated admin session.
 */

import { NextResponse }                   from "next/server";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";
import { syncFundamentals }               from "@/lib/fundamentals-sync";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  // Verify admin session
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  // Check admin role (user_id first, email fallback for migrated accounts)
  let role: string | null = null;

  const { data: byId } = await supabaseAdmin
    .from("ifas")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  role = byId?.role ?? null;

  if (!role && user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("role")
      .eq("email", user.email)
      .maybeSingle();
    role = byEmail?.role ?? null;
  }

  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const results = await syncFundamentals();
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
