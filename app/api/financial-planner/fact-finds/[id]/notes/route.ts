import { NextResponse } from "next/server";
import { requireIFARecord, unauthorised } from "@/lib/auth-guard";
import {
  createNote,
  listNotes,
} from "@/lib/financial-planner/fact-find-service";
import type { CreateNotePayload } from "@/lib/financial-planner/fact-find-types";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const notes = await listNotes(params.id);
    return NextResponse.json({ notes });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const body = await request.json() as Partial<CreateNotePayload>;
    if (!body.content?.trim()) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const note = await createNote(params.id, rec.ifaId, {
      content: body.content,
      is_flagged: body.is_flagged,
    });
    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
