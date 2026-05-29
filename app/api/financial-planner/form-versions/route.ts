import { NextResponse } from "next/server";
import { requireAdmin, requireIFARecord, unauthorised } from "@/lib/auth-guard";
import {
  createFormVersion,
  listFormVersions,
} from "@/lib/financial-planner/fact-find-service";

export async function GET(request: Request) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const versions = await listFormVersions();
    return NextResponse.json({ versions });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  try {
    const body = await request.json() as { version_name?: string; notes?: string };
    if (!body.version_name?.trim()) {
      return NextResponse.json({ error: "version_name is required" }, { status: 400 });
    }
    const version = await createFormVersion(body.version_name.trim(), body.notes);
    return NextResponse.json({ version }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
