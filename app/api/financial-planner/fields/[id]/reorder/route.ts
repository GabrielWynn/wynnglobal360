import { NextResponse } from "next/server";
import { requireAdmin, unauthorised } from "@/lib/auth-guard";
import { reorderField } from "@/lib/financial-planner/fact-find-service";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  try {
    const body = await request.json() as { direction?: "up" | "down" };
    if (body.direction !== "up" && body.direction !== "down") {
      return NextResponse.json({ error: 'direction must be "up" or "down"' }, { status: 400 });
    }
    await reorderField(params.id, body.direction);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
