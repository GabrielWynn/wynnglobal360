"use client";

import { useState } from "react";
import { getAuthHeaders } from "@/lib/supabase";
import type { FFNote } from "@/lib/financial-planner/fact-find-types";

interface NotesPanelProps {
  factFindId: string;
  initialNotes: FFNote[];
}

export default function NotesPanel({ factFindId, initialNotes }: NotesPanelProps) {
  const [notes, setNotes] = useState<FFNote[]>(initialNotes);
  const [content, setContent] = useState("");
  const [isFlagged, setIsFlagged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addNote() {
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/financial-planner/fact-finds/${factFindId}/notes`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), is_flagged: isFlagged }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add note");
        return;
      }
      setNotes((prev) => [data.note, ...prev]);
      setContent("");
      setIsFlagged(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleResolved(note: FFNote) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/financial-planner/notes/${note.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ is_resolved: !note.is_resolved }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotes((prev) => prev.map((n) => (n.id === note.id ? data.note : n)));
      }
    } catch {
      // silently ignore
    }
  }

  async function toggleFlag(note: FFNote) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/financial-planner/notes/${note.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ is_flagged: !note.is_flagged }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotes((prev) => prev.map((n) => (n.id === note.id ? data.note : n)));
      }
    } catch {
      // silently ignore
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
        Notes & Flags
      </h3>

      {/* Add note */}
      <div className="flex flex-col gap-2">
        <textarea
          className="w-full px-3 py-2 rounded-lg border text-sm resize-y min-h-[80px] focus:outline-none"
          style={{
            borderColor: "var(--wgi-border)",
            color: "var(--wgi-text)",
            background: "white",
          }}
          placeholder="Add a note…"
          value={content}
          rows={3}
          onChange={(e) => {
            setContent(e.target.value);
            setError(null);
          }}
        />

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-[var(--wgi-navy)]"
              checked={isFlagged}
              onChange={(e) => setIsFlagged(e.target.checked)}
            />
            <span style={{ color: "var(--wgi-text-muted)" }}>Flag for follow-up</span>
          </label>

          <button
            type="button"
            onClick={addNote}
            disabled={saving || !content.trim()}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--wgi-navy)" }}
          >
            {saving ? "Adding…" : "Add Note"}
          </button>
        </div>

        {error && (
          <p className="text-xs" style={{ color: "#ef4444" }}>
            {error}
          </p>
        )}
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-sm italic" style={{ color: "var(--wgi-text-muted)" }}>
          No notes yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg border p-3 flex flex-col gap-2"
              style={{
                borderColor: note.is_flagged && !note.is_resolved ? "#fbbf24" : "var(--wgi-border)",
                background: note.is_resolved ? "var(--wgi-bg)" : "white",
                opacity: note.is_resolved ? 0.7 : 1,
              }}
            >
              <div className="flex items-start gap-2">
                {note.is_flagged && !note.is_resolved && (
                  <span className="text-xs mt-0.5 flex-shrink-0" title="Flagged">🚩</span>
                )}
                <p
                  className={`text-sm flex-1 ${note.is_resolved ? "line-through" : ""}`}
                  style={{ color: "var(--wgi-text)" }}
                >
                  {note.content}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                    {note.author_name ?? "Admin"} ·{" "}
                    {new Date(note.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFlag(note)}
                    className="text-xs transition-opacity hover:opacity-70"
                    style={{ color: note.is_flagged ? "#d97706" : "var(--wgi-text-muted)" }}
                    title={note.is_flagged ? "Remove flag" : "Flag"}
                  >
                    {note.is_flagged ? "🚩 Unflag" : "Flag"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleResolved(note)}
                    className="text-xs transition-opacity hover:opacity-70"
                    style={{ color: note.is_resolved ? "var(--wgi-text-muted)" : "#16a34a" }}
                    title={note.is_resolved ? "Mark unresolved" : "Mark resolved"}
                  >
                    {note.is_resolved ? "Reopen" : "✓ Resolve"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
