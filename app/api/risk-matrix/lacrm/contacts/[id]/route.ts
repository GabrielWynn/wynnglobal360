import { NextResponse } from "next/server";
import { requireApp, unauthorised } from "@/lib/auth-guard";
import { getLacrmContact } from "@/lib/risk-matrix/lacrm";
import { LACRM_CONTACT_ID, contactToAnswers } from "@/lib/risk-matrix/lacrm-map";

export const dynamic = "force-dynamic";

// GET /api/risk-matrix/lacrm/contacts/[id] — one contact, already mapped to form answers
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const rec = await requireApp(request, "risk-matrix");
  if (!rec) return unauthorised();

  if (!LACRM_CONTACT_ID.test(params.id)) {
    return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  }

  try {
    const contact = await getLacrmContact(params.id);
    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      contactId: contact.contactId,
      name: contact.name,
      ...contactToAnswers(contact),
    });
  } catch (err) {
    console.error("[risk-matrix lacrm contact]", err);
    return NextResponse.json({ error: "LACRM no disponible" }, { status: 503 });
  }
}
