import { NextResponse } from "next/server";
import { requireApp, unauthorised } from "@/lib/auth-guard";
import { getClientWithEvaluations } from "@/lib/risk-matrix/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireApp(request, "risk-matrix");
  if (!rec) return unauthorised();

  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    const data = await getClientWithEvaluations(params.id);
    if (!data) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
