"use client";

import { useCallback, useEffect, useState } from "react";
import { IconRefresh, IconShieldCheck } from "@tabler/icons-react";
import { createBrowserClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditEntry {
  id: string;
  actor_email: string;
  action: string;
  target_email: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token ?? ""}` };
}

function actionLabel(action: string): { label: string; color: string } {
  switch (action) {
    case "user.invite":
      return { label: "User Invited", color: "bg-blue-100 text-blue-700" };
    case "user.role_change":
      return { label: "Role Changed", color: "bg-purple-100 text-purple-700" };
    case "user.deactivate":
      return { label: "Deactivated", color: "bg-red-100 text-red-700" };
    case "user.reactivate":
      return { label: "Reactivated", color: "bg-green-100 text-green-700" };
    default:
      return { label: action, color: "bg-gray-100 text-gray-600" };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DiffCell({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const keys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  );
  if (keys.length === 0) return <span style={{ color: "var(--wgi-text-muted)" }}>—</span>;

  return (
    <div className="space-y-0.5">
      {keys.map((k) => {
        const prev = before?.[k];
        const next = after?.[k];
        return (
          <div key={k} className="text-xs flex items-center gap-1.5">
            <span className="font-medium capitalize" style={{ color: "var(--wgi-text-muted)" }}>
              {k}:
            </span>
            {prev !== undefined && (
              <span className="line-through text-red-400">{String(prev)}</span>
            )}
            {prev !== undefined && next !== undefined && (
              <span style={{ color: "var(--wgi-text-muted)" }}>→</span>
            )}
            {next !== undefined && (
              <span className="text-green-600 font-medium">{String(next)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

export default function AuditLogTable() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");

  const fetchEntries = useCallback(async (p: number, action: string) => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(p * PAGE_SIZE),
      });
      if (action !== "all") params.set("action", action);
      const res = await fetch(`/api/admin/audit?${params}`, { headers });
      if (res.ok) {
        const json = await res.json();
        setEntries(json.data ?? []);
        setTotal(json.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(page, actionFilter);
  }, [fetchEntries, page, actionFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 text-sm border rounded-lg focus:outline-none"
            style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
          >
            <option value="all">All Actions</option>
            <option value="user.invite">User Invited</option>
            <option value="user.role_change">Role Changed</option>
            <option value="user.deactivate">Deactivated</option>
            <option value="user.reactivate">Reactivated</option>
          </select>
        </div>

        <button
          onClick={() => fetchEntries(page, actionFilter)}
          className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
        >
          <IconRefresh size={14} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
        {loading ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--wgi-text-muted)" }}>
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="p-10 flex flex-col items-center gap-3">
            <IconShieldCheck size={32} style={{ color: "var(--wgi-text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>No audit events found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left"
                  style={{ borderColor: "var(--wgi-border)", background: "var(--wgi-bg)" }}
                >
                  {["Time", "Actor", "Action", "Target", "Changes"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--wgi-text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const { label, color } = actionLabel(entry.action);
                  return (
                    <tr
                      key={entry.id}
                      className="border-b last:border-0 hover:bg-slate-50/70 transition-colors"
                      style={{ borderColor: "var(--wgi-border)" }}
                    >
                      <td className="px-5 py-3.5 whitespace-nowrap text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                        {formatDate(entry.created_at)}
                      </td>
                      <td className="px-5 py-3.5 text-xs font-medium" style={{ color: "var(--wgi-text)" }}>
                        {entry.actor_email}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${color}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                        {entry.target_email ?? "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <DiffCell before={entry.before_data} after={entry.after_data} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs" style={{ color: "var(--wgi-text-light)" }}>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
