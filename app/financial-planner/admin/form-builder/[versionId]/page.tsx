import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getFormVersionById,
  getFormVersionWithContent,
} from "@/lib/financial-planner/fact-find-service";
import FormVersionEditor from "@/components/financial-planner/FormVersionEditor";

export default async function FormVersionEditorPage({
  params,
}: {
  params: { versionId: string };
}) {
  const version = await getFormVersionById(params.versionId);
  if (!version) notFound();

  const sections = await getFormVersionWithContent(params.versionId);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-1">
        <Link
          href="/financial-planner"
          className="text-sm hover:underline"
          style={{ color: "var(--wgi-text-muted)" }}
        >
          Financial Planner
        </Link>
        <span style={{ color: "var(--wgi-text-muted)" }}>/</span>
        <Link
          href="/financial-planner/admin/form-builder"
          className="text-sm hover:underline"
          style={{ color: "var(--wgi-text-muted)" }}
        >
          Form Builder
        </Link>
        <span style={{ color: "var(--wgi-text-muted)" }}>/</span>
        <span className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
          {version.version_name}
        </span>
      </div>

      <div className="flex items-start justify-between mb-8 mt-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
              {version.version_name}
            </h1>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "var(--wgi-bg)", color: "var(--wgi-text-muted)" }}
            >
              v{version.version_number}
            </span>
            {version.is_active && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: "var(--wgi-gold)", color: "white" }}
              >
                Active
              </span>
            )}
          </div>
          {version.notes && (
            <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
              {version.notes}
            </p>
          )}
        </div>
      </div>

      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--wgi-border)", background: "white" }}
      >
        <FormVersionEditor
          versionId={params.versionId}
          versionName={version.version_name}
          initialSections={sections}
        />
      </div>
    </div>
  );
}
