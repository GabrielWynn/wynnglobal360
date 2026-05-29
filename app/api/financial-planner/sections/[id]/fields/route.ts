import { NextResponse } from "next/server";
import { requireAdmin, requireIFARecord, unauthorised } from "@/lib/auth-guard";
import {
  createField,
  listFields,
} from "@/lib/financial-planner/fact-find-service";
import type { CreateFieldPayload } from "@/lib/financial-planner/fact-find-types";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const fields = await listFields(params.id);
    return NextResponse.json({ fields });
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
    const body = await request.json() as Partial<CreateFieldPayload>;
    if (!body.key?.trim() || !body.label_en?.trim() || !body.label_es?.trim() || !body.field_type) {
      return NextResponse.json(
        { error: "key, label_en, label_es, and field_type are required" },
        { status: 400 }
      );
    }

    const field = await createField(params.id, {
      key: body.key.trim(),
      label_en: body.label_en.trim(),
      label_es: body.label_es.trim(),
      field_type: body.field_type,
      is_required: body.is_required,
      options: body.options,
      placeholder_en: body.placeholder_en,
      placeholder_es: body.placeholder_es,
      help_text_en: body.help_text_en,
      help_text_es: body.help_text_es,
    });
    return NextResponse.json({ field }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    const status = msg.includes("unique") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
