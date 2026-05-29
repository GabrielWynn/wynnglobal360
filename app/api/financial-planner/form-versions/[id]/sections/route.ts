import { NextResponse } from "next/server";
import { requireAdmin, requireIFARecord, unauthorised } from "@/lib/auth-guard";
import {
  createSection,
  listSections,
} from "@/lib/financial-planner/fact-find-service";
import type { CreateSectionPayload } from "@/lib/financial-planner/fact-find-types";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const sections = await listSections(params.id);
    return NextResponse.json({ sections });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  try {
    const body = await request.json() as Partial<CreateSectionPayload>;
    if (!body.key?.trim() || !body.label_en?.trim() || !body.label_es?.trim()) {
      return NextResponse.json(
        { error: "key, label_en, and label_es are required" },
        { status: 400 }
      );
    }

    const section = await createSection(params.id, {
      key: body.key.trim(),
      label_en: body.label_en.trim(),
      label_es: body.label_es.trim(),
    });
    return NextResponse.json({ section }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    const status = msg.includes("unique") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
