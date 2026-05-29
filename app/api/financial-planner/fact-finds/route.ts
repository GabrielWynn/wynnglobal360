import { NextResponse } from "next/server";
import { requireIFARecord, unauthorised } from "@/lib/auth-guard";
import {
  createFactFind,
  listFactFinds,
} from "@/lib/financial-planner/fact-find-service";
import type { CreateFactFindPayload } from "@/lib/financial-planner/fact-find-types";

export async function GET(request: Request) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const factFinds = await listFactFinds(rec.ifaId);
    return NextResponse.json({ fact_finds: factFinds });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const body = await request.json() as Partial<CreateFactFindPayload>;
    if (!body.client_id || !body.language) {
      return NextResponse.json(
        { error: "client_id and language are required" },
        { status: 400 }
      );
    }
    if (body.language !== "en" && body.language !== "es") {
      return NextResponse.json(
        { error: 'language must be "en" or "es"' },
        { status: 400 }
      );
    }

    const factFind = await createFactFind(rec.ifaId, {
      client_id: body.client_id,
      language: body.language,
    });
    return NextResponse.json({ fact_find: factFind }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
