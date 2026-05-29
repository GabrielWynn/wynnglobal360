"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/supabase";
import type { CreateClientPayload } from "@/lib/financial-planner/fact-find-types";

interface ClientFormProps {
  onCreated?: (clientId: string) => void;
}

export default function ClientForm({ onCreated }: ClientFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<Partial<CreateClientPayload>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof CreateClientPayload, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name?.trim() || !form.last_name?.trim()) {
      setError("First name and last name are required.");
      return;
    }

    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/financial-planner/clients", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create client");
        return;
      }

      if (onCreated) {
        onCreated(data.client.id);
      } else {
        router.push(`/financial-planner/clients/${data.client.id}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-offset-0";
  const inputStyle = {
    borderColor: "var(--wgi-border)",
    color: "var(--wgi-text)",
    background: "white",
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--wgi-text)" }}>
            First Name <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            type="text"
            className={inputClass}
            style={inputStyle}
            value={form.first_name ?? ""}
            required
            onChange={(e) => set("first_name", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--wgi-text)" }}>
            Last Name <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            type="text"
            className={inputClass}
            style={inputStyle}
            value={form.last_name ?? ""}
            required
            onChange={(e) => set("last_name", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--wgi-text)" }}>
            Email
          </label>
          <input
            type="email"
            className={inputClass}
            style={inputStyle}
            value={form.email ?? ""}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--wgi-text)" }}>
            Phone
          </label>
          <input
            type="tel"
            className={inputClass}
            style={inputStyle}
            value={form.phone ?? ""}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--wgi-text)" }}>
            Date of Birth
          </label>
          <input
            type="date"
            className={inputClass}
            style={inputStyle}
            value={form.date_of_birth ?? ""}
            onChange={(e) => set("date_of_birth", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--wgi-text)" }}>
            Nationality
          </label>
          <input
            type="text"
            className={inputClass}
            style={inputStyle}
            value={form.nationality ?? ""}
            onChange={(e) => set("nationality", e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" style={{ color: "var(--wgi-text)" }}>
          Notes
        </label>
        <textarea
          className={`${inputClass} min-h-[80px] resize-y`}
          style={inputStyle}
          value={form.notes ?? ""}
          rows={3}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>

      {error && (
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}
        >
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--wgi-navy)" }}
        >
          {saving ? "Creating…" : "Create Client"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
