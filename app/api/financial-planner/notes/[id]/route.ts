import { NextResponse } from "next/server";
import { requireIFARecord, unauthorised } from "@/lib/auth-guard";
import { updateNote } from "@/lib/financial-planner/fact-find-service";
import type { UpdateNotePayload } from "@/lib/financial-planner/fact-find-types";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const body = await request.json() as UpdateNotePayload;
    const note = await updateNote(params.id, body);
    if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ note });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
