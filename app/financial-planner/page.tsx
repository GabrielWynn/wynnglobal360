import Link from "next/link";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { listClients } from "@/lib/financial-planner/fact-find-service";
import ClientsTable from "@/components/financial-planner/ClientsTable";

export default async function FinancialPlannerPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let ifaRecord: { id: string; role: string; name: string } | null = null;
  const { data: byUserId } = await supabaseAdmin
    .from("ifas")
    .select("id, role, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (byUserId) {
    ifaRecord = byUserId as { id: string; role: string; name: string };
  } else if (user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("id, role, name")
      .eq("email", user.email)
      .maybeSingle();
    if (byEmail) ifaRecord = byEmail as { id: string; role: string; name: string };
  }

  if (!ifaRecord) redirect("/advisors");

  const clients = await listClients(ifaRecord.id);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
            Financial Planner
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
            Manage your clients and Fact Find sessions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {ifaRecord.role === "admin" && (
            <>
              <Link
                href="/financial-planner/admin/fact-finds"
                className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
                style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
              >
                All Fact Finds
              </Link>
              <Link
                href="/financial-planner/admin/form-builder"
                className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
                style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
              >
                Form Builder
              </Link>
            </>
          )}
          <Link
            href="/financial-planner/clients/new"
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--wgi-navy)" }}
          >
            + New Client
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div
          className="rounded-xl border px-5 py-4"
          style={{ borderColor: "var(--wgi-border)", background: "white" }}
        >
          <p className="text-2xl font-bold" style={{ color: "var(--wgi-navy)" }}>
            {clients.length}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
            Total Clients
          </p>
        </div>
      </div>

      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--wgi-border)", background: "white" }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--wgi-text)" }}>
          My Clients
        </h2>
        <ClientsTable clients={clients} />
      </div>
    </div>
  );
}
