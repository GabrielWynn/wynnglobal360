import { NextResponse } from "next/server";
import { requireAdmin, unauthorised } from "@/lib/auth-guard";
import { listAllFactFinds } from "@/lib/financial-planner/fact-find-service";

export async function GET(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  try {
    const factFinds = await listAllFactFinds();
    return NextResponse.json({ fact_finds: factFinds });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
