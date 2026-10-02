import EvaluationForm from "@/components/risk-matrix/EvaluationForm";
import type { LacrmPick } from "@/components/risk-matrix/LacrmLookup";
import { requireRiskMatrixAccess } from "@/lib/risk-matrix/access";
import type { Answers } from "@/lib/risk-matrix/engine";
import { getLacrmContact } from "@/lib/risk-matrix/lacrm";
import { LACRM_CONTACT_ID, contactToAnswers } from "@/lib/risk-matrix/lacrm-map";
import { getClientWithEvaluations } from "@/lib/risk-matrix/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewEvaluationPage({
  searchParams,
}: {
  searchParams: { client?: string; lacrm?: string };
}) {
  await requireRiskMatrixAccess();

  // ?client=<id> starts a re-evaluation from the client's latest answers
  const clientId = searchParams.client;
  let prefill: Answers | undefined;

  if (clientId && UUID.test(clientId)) {
    const data = await getClientWithEvaluations(clientId);
    const latest = data?.evaluations[0];
    if (latest) {
      // Date and Compliance Judgment are never carried over
      prefill = {
        ...latest.answers,
        fe: "",
        tipo_eval: "Revisión Periódica",
        cj: "Sin observación",
        cjj: "",
      };
    }
  }

  // ?lacrm=<ContactId> starts a first evaluation from a LACRM contact
  const contactId = searchParams.lacrm;
  let lacrm: LacrmPick | undefined;
  let notice: string | undefined;

  if (!prefill && contactId && LACRM_CONTACT_ID.test(contactId)) {
    try {
      const contact = await getLacrmContact(contactId);
      if (contact) {
        lacrm = {
          contactId: contact.contactId,
          name: contact.name,
          ...contactToAnswers(contact),
        };
      } else {
        notice = "No se encontró el contacto en LACRM. Puedes completar los datos manualmente.";
      }
    } catch (err) {
      console.error("risk-matrix: LACRM prefill failed", err);
      notice = "LACRM no disponible. Puedes completar los datos manualmente.";
    }
  }

  return (
    <EvaluationForm
      key={prefill ? clientId : lacrm ? `lacrm-${lacrm.contactId}` : "new"}
      prefill={prefill}
      reeval={!!prefill}
      lacrm={lacrm}
      notice={notice}
    />
  );
}
