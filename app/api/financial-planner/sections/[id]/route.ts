import { NextResponse } from "next/server";
import { requireAdmin, requireIFARecord, unauthorised } from "@/lib/auth-guard";
import {
  deleteSection,
  getSectionById,
  updateSection,
} from "@/lib/financial-planner/fact-find-service";
import type { UpdateSectionPayload } from "@/lib/financial-planner/fact-find-types";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const section = await getSectionById(params.id);
    if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ section });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  try {
    const body = await request.json() as UpdateSectionPayload;
    const section = await updateSection(params.id, body);
    if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ section });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  try {
    await deleteSection(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
