import { NextResponse } from "next/server";
import { requireIFARecord, unauthorised } from "@/lib/auth-guard";
import {
  getClientById,
  updateClient,
} from "@/lib/financial-planner/fact-find-service";
import type { UpdateClientPayload } from "@/lib/financial-planner/fact-find-types";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const ifaId = rec.role === "admin" ? undefined : rec.ifaId;
    const client = await getClientById(params.id, ifaId);
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ client });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const body = await request.json() as UpdateClientPayload;
    const client = await updateClient(params.id, rec.ifaId, body);
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ client });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
