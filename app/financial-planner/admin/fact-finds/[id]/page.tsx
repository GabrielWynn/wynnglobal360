import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAnswersForFactFind,
  getFactFindById,
  getFormVersionWithContent,
  listNotes,
} from "@/lib/financial-planner/fact-find-service";
import FactFindReadOnlyView from "@/components/financial-planner/FactFindReadOnlyView";
import NotesPanel from "@/components/financial-planner/NotesPanel";
import type { FFLanguage } from "@/lib/financial-planner/fact-find-types";
import { formatDateDisplay } from "@/lib/financial-planner/fact-find-types";

export default async function AdminFactFindDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const factFind = await getFactFindById(params.id);
  if (!factFind) notFound();

  const [sections, answers, notes] = await Promise.all([
    getFormVersionWithContent(factFind.form_version_id),
    getAnswersForFactFind(params.id),
    listNotes(params.id),
  ]);

  const client = factFind.client as
    | { first_name?: string; last_name?: string; email?: string }
    | undefined;
  const ifa = (factFind as { ifa?: { name?: string } }).ifa;
  const language: FFLanguage = factFind.language;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-6" style={{ color: "var(--wgi-text-muted)" }}>
        <Link href="/financial-planner" className="hover:underline">Financial Planner</Link>
        <span>/</span>
        <Link href="/financial-planner/admin/fact-finds" className="hover:underline">All Fact Finds</Link>
        <span>/</span>
        <span style={{ color: "var(--wgi-text)" }}>
          {client?.last_name}, {client?.first_name}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
            {client?.first_name} {client?.last_name}
          </h1>
          <div className="flex items-center gap-4 mt-1">
            {client?.email && (
              <span className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
                {client.email}
              </span>
            )}
            {ifa?.name && (
              <span className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
                IFA: {ifa.name}
              </span>
            )}
            <span className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
              {language === "es" ? "Español" : "English"}
            </span>
            {factFind.submitted_at && (
              <span className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
                Submitted: {formatDateDisplay(factFind.submitted_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main layout: answers + notes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Answers — takes 2/3 */}
        <div className="lg:col-span-2">
          <FactFindReadOnlyView
            factFind={factFind}
            sections={sections}
            answers={answers}
            language={language}
          />
        </div>

        {/* Notes — takes 1/3 */}
        <div
          className="rounded-xl border p-5 self-start sticky top-20"
          style={{ borderColor: "var(--wgi-border)", background: "white" }}
        >
          <NotesPanel factFindId={params.id} initialNotes={notes} />
        </div>
      </div>
    </div>
  );
}
