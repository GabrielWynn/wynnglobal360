import { NextResponse } from "next/server";
import { requireApp, unauthorised } from "@/lib/auth-guard";
import { evaluate } from "@/lib/risk-matrix/engine";
import { blockingFields, sanitiseAnswers } from "@/lib/risk-matrix/form";
import { LACRM_CONTACT_ID } from "@/lib/risk-matrix/lacrm-map";
import { saveEvaluation } from "@/lib/risk-matrix/service";

// ---------------------------------------------------------------------------
// POST /api/risk-matrix/evaluations — save a new (immutable) evaluation
// Body: { answers: Answers }
// The result is recomputed here; nothing scored in the browser is trusted.
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const rec = await requireApp(request, "risk-matrix");
  if (!rec) return unauthorised();

  let body: { answers?: unknown; lacrmContactId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const clean = sanitiseAnswers(body?.answers);
  if (!clean.ok) {
    return NextResponse.json({ error: clean.error }, { status: 400 });
  }

  const answers = clean.answers;
  const result = evaluate(answers);

  const blocking = blockingFields(answers, result);
  if (blocking.length) {
    return NextResponse.json(
      { error: `Faltan campos: ${blocking.map((f) => f.label).join(", ")}` },
      { status: 400 }
    );
  }

  // Optional link to the LACRM contact the evaluation started from
  const lacrmContactId =
    typeof body.lacrmContactId === "string" && LACRM_CONTACT_ID.test(body.lacrmContactId)
      ? body.lacrmContactId
      : undefined;

  try {
    const saved = await saveEvaluation(answers, result, rec.ifaId, lacrmContactId);
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
