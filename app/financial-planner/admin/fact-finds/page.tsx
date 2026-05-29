import Link from "next/link";
import { listAllFactFinds } from "@/lib/financial-planner/fact-find-service";
import AdminFactFindsTable from "@/components/financial-planner/AdminFactFindsTable";

export default async function AdminFactFindsPage() {
  const factFinds = await listAllFactFinds();

  const total = factFinds.length;
  const inProgress = factFinds.filter((ff) => ff.status === "in_progress").length;
  const completed = factFinds.filter((ff) => ff.status === "completed").length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
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
              All Fact Finds
            </span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
            Fact Finds — Admin View
          </h1>
        </div>
        <Link
          href="/financial-planner/admin/form-builder"
          className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
        >
          Form Builder
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total", value: total, color: "var(--wgi-navy)" },
          { label: "In Progress", value: inProgress, color: "#d97706" },
          { label: "Completed", value: completed, color: "#16a34a" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border px-5 py-4"
            style={{ borderColor: "var(--wgi-border)", background: "white" }}
          >
            <p className="text-2xl font-bold" style={{ color }}>
              {value}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--wgi-border)", background: "white" }}
      >
        <AdminFactFindsTable factFinds={factFinds} />
      </div>
    </div>
  );
}
