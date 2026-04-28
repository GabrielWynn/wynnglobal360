/**
 * /api/model-portfolio/cron/prices
 *
 * Triggered automatically by Vercel Cron (GET) every day at 06:00 UTC.
 * Also accepts POST from the admin sync endpoint for on-demand runs.
 *
 * Auth (either is accepted):
 *  - Vercel Cron:  Authorization: Bearer <CRON_SECRET>
 *  - Manual/admin: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */

import { NextResponse } from "next/server";
import { syncPrices } from "@/lib/price-sync";

export const dynamic    = "force-dynamic";
export const maxDuration = 60;

function isAuthorised(request: Request): boolean {
  const auth        = request.headers.get("authorization") ?? "";
  const cronSecret  = process.env.CRON_SECRET              ?? "";
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  return (
    (!!cronSecret  && auth === `Bearer ${cronSecret}`)  ||
    (!!serviceKey  && auth === `Bearer ${serviceKey}`)
  );
}

async function handle(request: Request) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    const results = await syncPrices();
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}

// Vercel Cron sends GET
export const GET  = handle;
// Manual / admin sends POST
export const POST = handle;
