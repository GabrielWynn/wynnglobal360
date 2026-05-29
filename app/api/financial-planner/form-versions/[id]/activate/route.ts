import { NextResponse } from "next/server";
import { requireAdmin, unauthorised } from "@/lib/auth-guard";
import {
  activateFormVersion,
  countInProgressFactFindsForVersion,
  getActiveFormVersion,
} from "@/lib/financial-planner/fact-find-service";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  try {
    const body = await request.json().catch(() => ({})) as { force?: boolean };

    // Warn if current active version has in-progress fact finds
    const current = await getActiveFormVersion();
    if (current && current.id !== params.id) {
      const inProgress = await countInProgressFactFindsForVersion(current.id);
      if (inProgress > 0 && !body.force) {
        return NextResponse.json(
          {
            warning: true,
            message: `The current active version has ${inProgress} fact find(s) in progress. Pass force: true to activate anyway.`,
            in_progress_count: inProgress,
          },
          { status: 409 }
        );
      }
    }

    await activateFormVersion(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
