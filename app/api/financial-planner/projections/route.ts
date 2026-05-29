import { NextResponse } from "next/server";
import { requireAuth, unauthorised } from "@/lib/auth-guard";
import { buildProjectionSummary, getPlanById } from "@/lib/financial-planner/service";

// ---------------------------------------------------------------------------
// GET /api/financial-planner/projections?plan_id=<uuid>
// Returns a lightweight projection summary for the selected plan.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const userId = await requireAuth(request);
  if (!userId) return unauthorised();

  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("plan_id");

  if (!planId) {
    return NextResponse.json({ error: "plan_id is required" }, { status: 400 });
  }

  try {
    const plan = await getPlanById(planId, userId);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    const projection = buildProjectionSummary(plan);
    return NextResponse.json({ projection });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build projection" },
      { status: 500 }
    );
  }
}
