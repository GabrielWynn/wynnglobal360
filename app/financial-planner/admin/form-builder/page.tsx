import Link from "next/link";
import { listFormVersions } from "@/lib/financial-planner/fact-find-service";
import FormBuilder from "@/components/financial-planner/FormBuilder";

export default async function FormBuilderPage() {
  const versions = await listFormVersions();

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link
              href="/financial-planner"
              className="text-sm hover:underline"
              style={{ color: "var(--wgi-text-muted)" }}
            >
              Financial Planner
            </Link>
            <span style={{ color: "var(--wgi-text-muted)" }}>/</span>
            <span className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
              Form Builder
            </span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
            Form Builder
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
            Manage Fact Find form versions, sections, and fields.
          </p>
        </div>
        <Link
          href="/financial-planner/admin/fact-finds"
          className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
        >
          ← All Fact Finds
        </Link>
      </div>

      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--wgi-border)", background: "white" }}
      >
        <FormBuilder versions={versions} />
      </div>
    </div>
  );
}
