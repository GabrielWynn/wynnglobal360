import { NextResponse } from "next/server";
import { requireRole, unauthorised } from "@/lib/auth-guard";
import { searchLacrmContacts } from "@/lib/risk-matrix/lacrm";

export const dynamic = "force-dynamic";

// GET /api/risk-matrix/lacrm/search?q= — find LACRM contacts to prefill an evaluation
export async function GET(request: Request) {
  const rec = await requireRole(request, ["admin", "compliance"]);
  if (!rec) return unauthorised();

  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 100);

  try {
    const results = await searchLacrmContacts(q);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[risk-matrix lacrm search]", err);
    return NextResponse.json({ error: "LACRM no disponible" }, { status: 503 });
  }
}
