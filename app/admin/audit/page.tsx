import AuditLogTable from "@/components/admin/AuditLogTable";

// Auth is already verified by app/admin/layout.tsx.
export default function AdminAuditPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
          Admin Audit Log
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--wgi-text-muted)" }}>
          Full history of administrative actions — user invites, role changes, and account status updates
        </p>
      </div>

      <AuditLogTable />
    </div>
  );
}
