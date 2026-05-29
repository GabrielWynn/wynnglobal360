import { NextResponse } from "next/server";
import { requireAuth, unauthorised } from "@/lib/auth-guard";
import { createPlan, listPlansByUser } from "@/lib/financial-planner/service";
import type { CreateFinancialPlanPayload } from "@/lib/financial-planner/types";

// ---------------------------------------------------------------------------
// GET /api/financial-planner/plans
// Returns all plans for the authenticated user.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const userId = await requireAuth(request);
  if (!userId) return unauthorised();

  try {
    const plans = await listPlansByUser(userId);
    return NextResponse.json({ plans });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch plans" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/financial-planner/plans
// Body: CreateFinancialPlanPayload
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const userId = await requireAuth(request);
  if (!userId) return unauthorised();

  let body: CreateFinancialPlanPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.title?.trim() || !body.plan_input || !body.plan_goals) {
    return NextResponse.json(
      { error: "title, plan_input and plan_goals are required" },
      { status: 400 }
    );
  }

  try {
    const plan = await createPlan(userId, body);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create plan" },
      { status: 500 }
    );
  }
}
