import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";
import {
  getClientById,
  listFactFinds,
} from "@/lib/financial-planner/fact-find-service";
import { formatDateDisplay } from "@/lib/financial-planner/fact-find-types";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  in_progress: { bg: "#fef3c7", text: "#92400e", label: "In Progress" },
  completed: { bg: "#d1fae5", text: "#065f46", label: "Completed" },
  abandoned: { bg: "#f3f4f6", text: "#6b7280", label: "Abandoned" },
};

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let ifaRecord: { id: string; role: string } | null = null;
  const { data: byUserId } = await supabaseAdmin
    .from("ifas")
    .select("id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byUserId) {
    ifaRecord = byUserId as { id: string; role: string };
  } else if (user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("id, role")
      .eq("email", user.email)
      .maybeSingle();
    if (byEmail) ifaRecord = byEmail as { id: string; role: string };
  }
  if (!ifaRecord) redirect("/advisors");

  const ifaId = ifaRecord.role === "admin" ? undefined : ifaRecord.id;
  const client = await getClientById(params.id, ifaId);
  if (!client) notFound();

  const allFactFinds = await listFactFinds(ifaRecord.id);
  const clientFactFinds = allFactFinds.filter((ff) => ff.client_id === params.id);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-6" style={{ color: "var(--wgi-text-muted)" }}>
        <Link href="/financial-planner" className="hover:underline">
          Financial Planner
        </Link>
        <span>/</span>
        <span style={{ color: "var(--wgi-text)" }}>
          {client.last_name}, {client.first_name}
        </span>
      </nav>

      {/* Client header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
            {client.first_name} {client.last_name}
          </h1>
          <div className="flex items-center gap-4 mt-1">
            {client.email && (
              <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
                {client.email}
              </p>
            )}
            {client.phone && (
              <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
                {client.phone}
              </p>
            )}
            {client.nationality && (
              <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
                {client.nationality}
              </p>
            )}
          </div>
        </div>
        <Link
          href={`/financial-planner/fact-find/new?clientId=${client.id}`}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--wgi-navy)" }}
        >
          + New Fact Find
        </Link>
      </div>

      {/* Client details card */}
      <div
        className="rounded-xl border p-5 mb-6 grid grid-cols-2 sm:grid-cols-3 gap-4"
        style={{ borderColor: "var(--wgi-border)", background: "white" }}
      >
        {[
          { label: "Date of Birth", value: formatDateDisplay(client.date_of_birth) },
          { label: "Nationality", value: client.nationality ?? "—" },
          { label: "Client since", value: new Date(client.created_at).toLocaleDateString() },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--wgi-text-muted)" }}>
              {label}
            </p>
            <p className="text-sm" style={{ color: "var(--wgi-text)" }}>
              {value || "—"}
            </p>
          </div>
        ))}
        {client.notes && (
          <div className="col-span-full">
            <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--wgi-text-muted)" }}>
              Notes
            </p>
            <p className="text-sm" style={{ color: "var(--wgi-text)" }}>
              {client.notes}
            </p>
          </div>
        )}
      </div>

      {/* Fact Finds */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--wgi-border)", background: "white" }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--wgi-text)" }}>
          Fact Find Sessions ({clientFactFinds.length})
        </h2>

        {clientFactFinds.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
              No fact find sessions yet.
            </p>
            <Link
              href={`/financial-planner/fact-find/new?clientId=${client.id}`}
              className="inline-block mt-3 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--wgi-navy)" }}
            >
              Start First Session
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {clientFactFinds.map((ff) => {
              const statusInfo = STATUS_STYLES[ff.status] ?? STATUS_STYLES.in_progress;
              const progress = Array.isArray(ff.completed_section_keys)
                ? ff.completed_section_keys.length
                : 0;

              return (
                <div
                  key={ff.id}
                  className="flex items-center justify-between px-4 py-3 rounded-lg border"
                  style={{ borderColor: "var(--wgi-border)" }}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: statusInfo.bg, color: statusInfo.text }}
                    >
                      {statusInfo.label}
                    </span>
                    <span className="text-xs font-mono uppercase" style={{ color: "var(--wgi-text-muted)" }}>
                      {ff.language === "es" ? "Español" : "English"}
                    </span>
                    <span className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                      {progress} sections completed
                    </span>
                    <span className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                      {new Date(ff.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <Link
                    href={`/financial-planner/fact-find/${ff.id}`}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: "var(--wgi-navy)", color: "white" }}
                  >
                    {ff.status === "completed" ? "Review" : "Continue"}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
