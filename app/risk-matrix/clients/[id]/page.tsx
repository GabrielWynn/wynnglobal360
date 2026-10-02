import { notFound } from "next/navigation";
import ClientDetail from "@/components/risk-matrix/ClientDetail";
import { requireRiskMatrixAccess } from "@/lib/risk-matrix/access";
import { getClientWithEvaluations } from "@/lib/risk-matrix/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RiskMatrixClientPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { eval?: string };
}) {
  await requireRiskMatrixAccess();

  if (!UUID.test(params.id)) notFound();

  const data = await getClientWithEvaluations(params.id);
  if (!data) notFound();

  return (
    <ClientDetail
      key={data.client.id}
      client={data.client}
      evaluations={data.evaluations}
      initialEvaluationId={searchParams.eval}
    />
  );
}
