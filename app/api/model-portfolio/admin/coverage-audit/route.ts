/**
 * GET /api/model-portfolio/admin/coverage-audit
 *
 * Returns a price coverage audit for all active portfolio funds:
 * summary counts + per-fund status (FT/Yahoo ok, stale, fallback targets, etc.)
 */

import { NextResponse } from "next/server";
import { runPriceCoverageAudit } from "@/lib/price-coverage-audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const audit = await runPriceCoverageAudit();
    return NextResponse.json(audit);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Audit failed" },
      { status: 500 }
    );
  }
}
