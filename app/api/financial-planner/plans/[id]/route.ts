import { NextResponse } from "next/server";
import { requireAuth, unauthorised } from "@/lib/auth-guard";
import { archivePlan, getPlanById, updatePlan } from "@/lib/financial-planner/service";
import type { UpdateFinancialPlanPayload } from "@/lib/financial-planner/types";

// ---------------------------------------------------------------------------
// GET /api/financial-planner/plans/[id]
// ---------------------------------------------------------------------------
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth(request);
  if (!userId) return unauthorised();

  const { id } = await params;
  try {
    const plan = await getPlanById(id, userId);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch plan" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/financial-planner/plans/[id]
// Body: UpdateFinancialPlanPayload
// ---------------------------------------------------------------------------
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth(request);
  if (!userId) return unauthorised();

  const { id } = await params;

  let body: UpdateFinancialPlanPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const plan = await updatePlan(id, userId, body);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update plan" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/financial-planner/plans/[id]
// Soft delete by archiving.
// ---------------------------------------------------------------------------
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth(request);
  if (!userId) return unauthorised();

  const { id } = await params;
  try {
    await archivePlan(id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to archive plan" },
      { status: 500 }
    );
  }
}
