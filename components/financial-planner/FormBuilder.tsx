"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/supabase";
import type { FFFormVersion } from "@/lib/financial-planner/fact-find-types";

interface FormBuilderProps {
  versions: FFFormVersion[];
}

export default function FormBuilder({ versions: initialVersions }: FormBuilderProps) {
  const router = useRouter();
  const [versions, setVersions] = useState<FFFormVersion[]>(initialVersions);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState<{ id: string; inProgress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/financial-planner/form-versions", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ version_name: newName.trim(), notes: newNotes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create version");
        return;
      }
      setVersions((prev) => [data.version, ...prev]);
      setShowCreateForm(false);
      setNewName("");
      setNewNotes("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleActivate(id: string, force = false) {
    setActivating(id);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/financial-planner/form-versions/${id}/activate`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();

      if (res.status === 409 && data.warning) {
        setConfirmActivate({ id, inProgress: data.in_progress_count });
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Failed to activate version");
        return;
      }

      setVersions((prev) =>
        prev.map((v) => ({ ...v, is_active: v.id === id }))
      );
      setConfirmActivate(null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setActivating(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
          {versions.length} version{versions.length !== 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--wgi-navy)" }}
        >
          + New Version
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div
          className="rounded-xl border p-5 flex flex-col gap-4"
          style={{ borderColor: "var(--wgi-border)", background: "var(--wgi-bg)" }}
        >
          <h3 className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
            New Form Version
          </h3>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Version name (e.g. Análisis Financiero v2)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)", background: "white" }}
            />
            <textarea
              placeholder="Internal notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none focus:outline-none"
              style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)", background: "white" }}
            />
            {error && (
              <p className="text-xs" style={{ color: "#ef4444" }}>
                {error}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: "var(--wgi-navy)" }}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setNewName("");
                setNewNotes("");
                setError(null);
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
              style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirm activate warning */}
      {confirmActivate && (
        <div
          className="rounded-xl border p-5 flex flex-col gap-3"
          style={{ borderColor: "#fbbf24", background: "#fffbeb" }}
        >
          <p className="text-sm font-semibold" style={{ color: "#92400e" }}>
            ⚠ Warning: {confirmActivate.inProgress} fact find
            {confirmActivate.inProgress !== 1 ? "s are" : " is"} currently in progress using
            the existing active version.
          </p>
          <p className="text-sm" style={{ color: "#92400e" }}>
            Activating a new version will not affect those in-progress fact finds. New fact
            finds will use the new version. Are you sure?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleActivate(confirmActivate.id, true)}
              disabled={activating !== null}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "#d97706" }}
            >
              Activate Anyway
            </button>
            <button
              type="button"
              onClick={() => setConfirmActivate(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ borderColor: "#fbbf24", color: "#92400e" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Versions list */}
      <div className="flex flex-col gap-3">
        {versions.map((version) => (
          <div
            key={version.id}
            className="rounded-xl border p-5 flex items-start justify-between gap-4"
            style={{
              borderColor: version.is_active ? "var(--wgi-gold)" : "var(--wgi-border)",
              background: version.is_active ? "#fffdf0" : "white",
            }}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
                  {version.version_name}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--wgi-bg)", color: "var(--wgi-text-muted)" }}>
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
                <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                  {version.notes}
                </p>
              )}
              <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                Created {new Date(version.created_at).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {!version.is_active && (
                <button
                  type="button"
                  onClick={() => handleActivate(version.id)}
                  disabled={activating === version.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
                >
                  {activating === version.id ? "Activating…" : "Activate"}
                </button>
              )}
              <Link
                href={`/financial-planner/admin/form-builder/${version.id}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--wgi-navy)" }}
              >
                Edit
              </Link>
            </div>
          </div>
        ))}
      </div>

      {versions.length === 0 && (
        <div
          className="text-center py-12 rounded-xl border"
          style={{ borderColor: "var(--wgi-border)" }}
        >
          <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
            No form versions yet. Create one to get started.
          </p>
        </div>
      )}
    </div>
  );
}
