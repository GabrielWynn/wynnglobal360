"use client";

import { useCallback, useState } from "react";
import {
  IconBan,
  IconCircleCheck,
  IconPencil,
  IconPlus,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { createBrowserClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IFAUser {
  id: string;
  code: string | null;
  name: string;
  email: string;
  role: "admin" | "ifa";
  status: string;
  user_id: string | null;
}

// ---------------------------------------------------------------------------
// Auth helper — include Bearer token on every admin API request
// ---------------------------------------------------------------------------

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ""}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          active ? "bg-green-500" : "bg-red-500"
        }`}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function RoleBadge({ role }: { role: "admin" | "ifa" }) {
  return role === "admin" ? (
    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
      Admin
    </span>
  ) : (
    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
      Advisor
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 select-none"
      style={{ background: "var(--wgi-navy)" }}
    >
      {initials}
    </div>
  );
}

// ── Lightweight modal (no radix dependency) ──────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h3
            className="text-base font-semibold"
            style={{ color: "var(--wgi-text)" }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <IconX size={15} style={{ color: "var(--wgi-text-muted)" }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Shared form field primitives ─────────────────────────────────────────────

const inputClass =
  "w-full px-3.5 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors";

const inputStyle: React.CSSProperties = {
  borderColor: "var(--wgi-border)",
  color: "var(--wgi-text)",
};

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-sm font-medium mb-1.5"
        style={{ color: "var(--wgi-text)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────

interface ToastState {
  message: string;
  kind: "success" | "error";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface UserTableProps {
  initialUsers: IFAUser[];
}

export default function UserTable({ initialUsers }: UserTableProps) {
  const [users, setUsers] = useState<IFAUser[]>(initialUsers);
  const [listLoading, setListLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // ── Modal visibility ───────────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<IFAUser | null>(null);
  const [statusTarget, setStatusTarget] = useState<IFAUser | null>(null);

  // ── Invite form ────────────────────────────────────────────────────────────
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ifa" | "admin">("ifa");
  const [inviteLoading, setInviteLoading] = useState(false);

  // ── Edit role form ─────────────────────────────────────────────────────────
  const [editRole, setEditRole] = useState<"ifa" | "admin">("ifa");
  const [editLoading, setEditLoading] = useState(false);

  // ── Status change ──────────────────────────────────────────────────────────
  const [statusLoading, setStatusLoading] = useState(false);

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  function showToast(message: string, kind: ToastState["kind"]) {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  }

  const reloadUsers = useCallback(async () => {
    setListLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/users", { headers });
      if (res.ok) setUsers(await res.json());
    } catch {
      /* silently preserve stale data */
    } finally {
      setListLoading(false);
    }
  }, []);

  // ------------------------------------------------------------------
  // Filtered rows
  // ------------------------------------------------------------------

  const filtered = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (statusFilter !== "all" && u.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q))
        return false;
    }
    return true;
  });

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          role: inviteRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to invite user");
      showToast(`Invitation sent to ${inviteEmail}`, "success");
      setInviteOpen(false);
      setInviteName("");
      setInviteEmail("");
      setInviteRole("ifa");
      await reloadUsers();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to invite user",
        "error"
      );
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleEditRole(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/users/${editTarget.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ type: "role", role: editRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update role");
      showToast("Role updated successfully", "success");
      setEditTarget(null);
      await reloadUsers();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to update role",
        "error"
      );
    } finally {
      setEditLoading(false);
    }
  }

  async function handleStatusChange() {
    if (!statusTarget) return;
    const action =
      statusTarget.status === "active" ? "deactivate" : "reactivate";
    setStatusLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/users/${statusTarget.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ type: "status", action }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? `Failed to ${action} user`);
      showToast(
        `${statusTarget.name} has been ${action}d`,
        "success"
      );
      setStatusTarget(null);
      await reloadUsers();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to update status",
        "error"
      );
    } finally {
      setStatusLoading(false);
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        {/* Left: search + filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <IconSearch
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--wgi-text-light)" }}
            />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2"
              style={{ ...inputStyle, minWidth: "220px" }}
            />
          </div>

          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2"
            style={inputStyle}
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="ifa">Advisor</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2"
            style={inputStyle}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Right: invite button */}
        <button
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--wgi-navy)" }}
        >
          <IconPlus size={15} />
          Invite User
        </button>
      </div>

      {/* ── Table ── */}
      <div
        className="bg-white rounded-xl border overflow-hidden"
        style={{ borderColor: "var(--wgi-border)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-left"
                style={{
                  borderColor: "var(--wgi-border)",
                  background: "var(--wgi-bg)",
                }}
              >
                {["Name", "Email", "Role", "Status", "Actions"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wide ${
                        i === 4 ? "text-right" : ""
                      }`}
                      style={{ color: "var(--wgi-text-muted)" }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                /* Loading skeleton */
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 rounded bg-slate-100 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm"
                    style={{ color: "var(--wgi-text-muted)" }}
                  >
                    No users found
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b last:border-0 hover:bg-slate-50/70 transition-colors"
                    style={{ borderColor: "var(--wgi-border)" }}
                  >
                    {/* Name */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.name} />
                        <span
                          className="font-medium"
                          style={{ color: "var(--wgi-text)" }}
                        >
                          {user.name}
                        </span>
                      </div>
                    </td>

                    {/* Email */}
                    <td
                      className="px-5 py-4"
                      style={{ color: "var(--wgi-text-muted)" }}
                    >
                      {user.email}
                    </td>

                    {/* Role */}
                    <td className="px-5 py-4">
                      <RoleBadge role={user.role} />
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <StatusBadge status={user.status} />
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit role */}
                        <button
                          onClick={() => {
                            setEditTarget(user);
                            setEditRole(user.role);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-gray-50"
                          style={{
                            borderColor: "var(--wgi-border)",
                            color: "var(--wgi-text)",
                          }}
                        >
                          <IconPencil size={12} />
                          Edit Role
                        </button>

                        {/* Deactivate / Reactivate */}
                        <button
                          onClick={() => setStatusTarget(user)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            user.status === "active"
                              ? "border-red-200 text-red-600 hover:bg-red-50"
                              : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                          }`}
                        >
                          {user.status === "active" ? (
                            <IconBan size={12} />
                          ) : (
                            <IconCircleCheck size={12} />
                          )}
                          {user.status === "active"
                            ? "Deactivate"
                            : "Reactivate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row count */}
      <p
        className="mt-2.5 text-xs"
        style={{ color: "var(--wgi-text-light)" }}
      >
        {listLoading
          ? "Loading…"
          : `Showing ${filtered.length} of ${users.length} user${users.length !== 1 ? "s" : ""}`}
      </p>

      {/* ================================================================
          Invite User Modal
          ================================================================ */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite New User"
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <FormField label="Full name">
            <input
              type="text"
              required
              autoFocus
              placeholder="Jane Smith"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </FormField>

          <FormField label="Email address">
            <input
              type="email"
              required
              placeholder="jane@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </FormField>

          <FormField label="Role">
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as "ifa" | "admin")
              }
              className={inputClass}
              style={inputStyle}
            >
              <option value="ifa">Advisor (IFA)</option>
              <option value="admin">Administrator</option>
            </select>
          </FormField>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors hover:bg-gray-50"
              style={{
                borderColor: "var(--wgi-border)",
                color: "var(--wgi-text)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={inviteLoading}
              className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition-opacity disabled:opacity-60"
              style={{ background: "var(--wgi-navy)" }}
            >
              {inviteLoading ? "Sending…" : "Send Invite"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ================================================================
          Edit Role Modal
          ================================================================ */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit User Role"
      >
        {editTarget && (
          <form onSubmit={handleEditRole} className="space-y-4">
            <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
              Updating role for{" "}
              <span
                className="font-semibold"
                style={{ color: "var(--wgi-text)" }}
              >
                {editTarget.name}
              </span>
            </p>

            <FormField label="New role">
              <select
                value={editRole}
                onChange={(e) =>
                  setEditRole(e.target.value as "ifa" | "admin")
                }
                className={inputClass}
                style={inputStyle}
              >
                <option value="ifa">Advisor (IFA)</option>
                <option value="admin">Administrator</option>
              </select>
            </FormField>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors hover:bg-gray-50"
                style={{
                  borderColor: "var(--wgi-border)",
                  color: "var(--wgi-text)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editLoading || editRole === editTarget.role}
                className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition-opacity disabled:opacity-60"
                style={{ background: "var(--wgi-navy)" }}
              >
                {editLoading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ================================================================
          Deactivate / Reactivate Confirmation Dialog
          ================================================================ */}
      <Modal
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        title={
          statusTarget?.status === "active"
            ? "Deactivate User"
            : "Reactivate User"
        }
      >
        {statusTarget && (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed" style={{ color: "var(--wgi-text-muted)" }}>
              {statusTarget.status === "active" ? (
                <>
                  Are you sure you want to deactivate{" "}
                  <span
                    className="font-semibold"
                    style={{ color: "var(--wgi-text)" }}
                  >
                    {statusTarget.name}
                  </span>
                  ?
                  <br />
                  <br />
                  Their active session will be revoked and they will be unable
                  to sign in until reactivated.
                </>
              ) : (
                <>
                  Are you sure you want to reactivate{" "}
                  <span
                    className="font-semibold"
                    style={{ color: "var(--wgi-text)" }}
                  >
                    {statusTarget.name}
                  </span>
                  ?
                  <br />
                  <br />
                  They will regain full access to the platform immediately.
                </>
              )}
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setStatusTarget(null)}
                className="px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors hover:bg-gray-50"
                style={{
                  borderColor: "var(--wgi-border)",
                  color: "var(--wgi-text)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleStatusChange}
                disabled={statusLoading}
                className={`px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition-opacity disabled:opacity-60 ${
                  statusTarget.status === "active"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {statusLoading
                  ? "Processing…"
                  : statusTarget.status === "active"
                  ? "Deactivate"
                  : "Reactivate"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================
          Toast notification
          ================================================================ */}
      {toast && (
        <div
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-full text-white text-sm shadow-xl ${
            toast.kind === "success" ? "bg-slate-900" : "bg-red-600"
          }`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <IconX size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
