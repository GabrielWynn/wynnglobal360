import { NextResponse } from "next/server";
import { requireApp, unauthorised } from "@/lib/auth-guard";
import { listClientSummaries } from "@/lib/risk-matrix/service";

export async function GET(request: Request) {
  const rec = await requireApp(request, "risk-matrix");
  if (!rec) return unauthorised();

  try {
    const clients = await listClientSummaries();
    return NextResponse.json({ clients });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
