import UserTable from "@/components/admin/UserTable";
import { listUsersWithApps } from "@/lib/app-access";
import type { IFAUser } from "@/components/admin/UserTable";

// Auth is already verified by app/admin/layout.tsx.
// This page only fetches data and renders the client table.
export default async function AdminUsersPage() {
  const users: IFAUser[] = await listUsersWithApps();

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      {/* Page header */}
      <div className="mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--wgi-text)" }}
        >
          User Management
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--wgi-text-muted)" }}
        >
          Manage user accounts, roles, and which apps each user can open
        </p>
      </div>

      <UserTable initialUsers={users} />
    </div>
  );
}
