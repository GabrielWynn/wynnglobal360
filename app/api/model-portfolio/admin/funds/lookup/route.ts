/**
 * GET  /api/model-portfolio/admin/funds/lookup?isin=XX
 *   → Returns fund data if the ISIN is already registered in mp_funds.
 *     Returns { found: false } if not registered.
 *
 * POST /api/model-portfolio/admin/funds/lookup
 *   Body: { isin: string }
 *   → Registers a new ISIN: searches EODHD for ticker info,
 *     creates the fund in mp_funds, returns the new fund record.
 *     Safe to call even if the ISIN already exists (idempotent).
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveISINToTicker } from "@/lib/eodhd";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET — check if ISIN exists
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isin = searchParams.get("isin")?.toUpperCase().trim();

  if (!isin) {
    return NextResponse.json({ error: "Missing isin param" }, { status: 400 });
  }

  const { data: fund } = await supabaseAdmin
    .from("mp_funds")
    .select("id, isin, display_name, eodhd_ticker, eodhd_exchange")
    .eq("isin", isin)
    .maybeSingle();

  if (fund) {
    return NextResponse.json({ found: true, fund });
  }

  // Not in DB — attempt EODHD search to give the admin a name preview
  const resolved = await resolveISINToTicker(isin).catch(() => null);
  return NextResponse.json({
    found:      false,
    isin,
    suggestion: resolved
      ? { name: resolved.name, ticker: resolved.ticker }
      : null,
  });
}

// ---------------------------------------------------------------------------
// POST — register a new ISIN (idempotent)
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const { isin: rawIsin, displayName: providedName } = await request.json();
  const isin = (rawIsin as string)?.toUpperCase().trim();

  if (!isin) {
    return NextResponse.json({ error: "Missing isin" }, { status: 400 });
  }

  // Check if already registered
  const { data: existing } = await supabaseAdmin
    .from("mp_funds")
    .select("id, isin, display_name, eodhd_ticker, eodhd_exchange")
    .eq("isin", isin)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ created: false, fund: existing });
  }

  // Try to resolve via EODHD
  const resolved = await resolveISINToTicker(isin).catch(() => null);

  const { data: fund, error } = await supabaseAdmin
    .from("mp_funds")
    .insert({
      isin,
      display_name:   providedName ?? resolved?.name ?? isin,
      currency:       "USD",
      eodhd_ticker:   resolved ? resolved.ticker.split(".")[0] : null,
      eodhd_exchange: resolved?.exchange ?? null,
    })
    .select("id, isin, display_name, eodhd_ticker, eodhd_exchange")
    .maybeSingle();

  if (error || !fund) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ created: true, fund });
}
