/**
 * /api/model-portfolio/admin/compositions
 *
 * GET  ?platform=<id>&profile=<id>  → list compositions
 * POST                               → create composition
 * PUT  ?id=<compositionId>           → update composition
 * DELETE ?id=<compositionId>         → delete composition
 *
 * All routes require an authenticated admin session.
 */

import { NextResponse } from "next/server";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAdmin(): Promise<string | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabaseAdmin
    .from("ifas").select("role").eq("user_id", user.id).maybeSingle();
  if (data?.role === "admin") return user.id;

  if (user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas").select("role").eq("email", user.email).maybeSingle();
    if (byEmail?.role === "admin") return user.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET — list compositions for a platform+profile
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platformId = searchParams.get("platform");
  const profileId  = searchParams.get("profile");

  const { data, error } = await supabaseAdmin
    .from("mp_portfolio_compositions")
    .select(`
      id, effective_from, effective_to, notes, created_at,
      mp_composition_holdings(
        id, weight, fund_id,
        mp_funds(isin, display_name)
      )
    `)
    .eq("platform_id", platformId ?? "")
    .eq("profile_id",  profileId  ?? "")
    .order("effective_from", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// ---------------------------------------------------------------------------
// POST — create a new composition + holdings
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { platformId, profileId, effectiveFrom, notes, holdings } = body;

  if (!platformId || !profileId || !effectiveFrom || !Array.isArray(holdings) || !holdings.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Set effective_to of the previous active composition
  const { data: prev } = await supabaseAdmin
    .from("mp_portfolio_compositions")
    .select("id")
    .eq("platform_id", platformId)
    .eq("profile_id",  profileId)
    .is("effective_to", null)
    .maybeSingle();

  if (prev) {
    await supabaseAdmin
      .from("mp_portfolio_compositions")
      .update({ effective_to: effectiveFrom })
      .eq("id", prev.id);
  }

  // Create the new composition
  const { data: comp, error: compErr } = await supabaseAdmin
    .from("mp_portfolio_compositions")
    .insert({ platform_id: platformId, profile_id: profileId, effective_from: effectiveFrom, notes })
    .select("id")
    .maybeSingle();

  if (compErr || !comp) {
    return NextResponse.json({ error: compErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // Insert holdings
  const holdingRows = holdings.map((h: { fundId: string; weight: number }) => ({
    composition_id: comp.id,
    fund_id:        h.fundId,
    weight:         h.weight,
  }));

  const { error: holdErr } = await supabaseAdmin
    .from("mp_composition_holdings")
    .insert(holdingRows);

  if (holdErr) {
    return NextResponse.json({ error: holdErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: comp.id });
}

// ---------------------------------------------------------------------------
// PUT — update holdings of an existing composition
// ---------------------------------------------------------------------------

export async function PUT(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { holdings, notes, effectiveFrom } = await request.json();

  // Update metadata
  await supabaseAdmin
    .from("mp_portfolio_compositions")
    .update({ notes, effective_from: effectiveFrom })
    .eq("id", id);

  // Replace holdings
  await supabaseAdmin.from("mp_composition_holdings").delete().eq("composition_id", id);

  if (Array.isArray(holdings) && holdings.length) {
    const rows = holdings.map((h: { fundId: string; weight: number }) => ({
      composition_id: id,
      fund_id:        h.fundId,
      weight:         h.weight,
    }));
    const { error } = await supabaseAdmin.from("mp_composition_holdings").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// DELETE — remove a composition and its holdings (cascade)
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("mp_portfolio_compositions")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
