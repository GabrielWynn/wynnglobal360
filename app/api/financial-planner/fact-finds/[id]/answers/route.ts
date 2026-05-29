import { NextResponse } from "next/server";
import { requireIFARecord, unauthorised } from "@/lib/auth-guard";
import { upsertSectionAnswers } from "@/lib/financial-planner/fact-find-service";
import type { UpsertSectionAnswersPayload } from "@/lib/financial-planner/fact-find-types";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const body = await request.json() as Partial<UpsertSectionAnswersPayload>;
    if (!body.section_key || !Array.isArray(body.answers)) {
      return NextResponse.json(
        { error: "section_key and answers[] are required" },
        { status: 400 }
      );
    }

    await upsertSectionAnswers(params.id, rec.ifaId, body.section_key, body.answers);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = (err as Error).message;
    const status = msg.includes("access denied") || msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
