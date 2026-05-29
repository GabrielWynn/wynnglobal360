import { NextResponse } from "next/server";
import { requireAdmin, requireIFARecord, unauthorised } from "@/lib/auth-guard";
import {
  deleteField,
  getFieldById,
  updateField,
} from "@/lib/financial-planner/fact-find-service";
import type { UpdateFieldPayload } from "@/lib/financial-planner/fact-find-types";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const field = await getFieldById(params.id);
    if (!field) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ field });
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
    const body = await request.json() as UpdateFieldPayload;
    const field = await updateField(params.id, body);
    if (!field) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ field });
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
    await deleteField(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
