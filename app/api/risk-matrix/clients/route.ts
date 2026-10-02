import { NextResponse } from "next/server";
import { requireRole, unauthorised } from "@/lib/auth-guard";
import { listClientSummaries } from "@/lib/risk-matrix/service";

export async function GET(request: Request) {
  const rec = await requireRole(request, ["admin", "compliance"]);
  if (!rec) return unauthorised();

  try {
    const clients = await listClientSummaries();
    return NextResponse.json({ clients });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
