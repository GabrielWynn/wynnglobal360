import UserTable from "@/components/admin/UserTable";
import { supabaseAdmin } from "@/lib/supabase";
import type { IFAUser } from "@/components/admin/UserTable";

// Auth is already verified by app/admin/layout.tsx.
// This page only fetches data and renders the client table.
export default async function AdminUsersPage() {
  const { data } = await supabaseAdmin
    .from("ifas")
    .select("id, code, name, email, role, status, user_id")
    .order("name");

  const users: IFAUser[] = data ?? [];

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
          Manage IFA advisor accounts, roles, and access
        </p>
      </div>

      <UserTable initialUsers={users} />
    </div>
  );
}
