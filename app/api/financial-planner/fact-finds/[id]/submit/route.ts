import { NextResponse } from "next/server";
import { requireIFARecord, unauthorised } from "@/lib/auth-guard";
import {
  getFactFindById,
  submitFactFind,
} from "@/lib/financial-planner/fact-find-service";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const factFind = await getFactFindById(params.id, rec.ifaId);
    if (!factFind) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (factFind.status === "completed") {
      return NextResponse.json({ error: "Fact find already completed" }, { status: 409 });
    }

    await submitFactFind(params.id, rec.ifaId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
