import ClientsList from "@/components/risk-matrix/ClientsList";
import { requireRiskMatrixAccess } from "@/lib/risk-matrix/access";
import { listClientSummaries } from "@/lib/risk-matrix/service";

export default async function RiskMatrixPage() {
  await requireRiskMatrixAccess();

  const clients = await listClientSummaries();

  return <ClientsList clients={clients} />;
}
