"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IconCheck,
  IconPencil,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { createBrowserClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Platform {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

interface CommissionType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface SystemSetting {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ""}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const inputClass =
  "w-full px-3.5 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors";
const inputStyle: React.CSSProperties = {
  borderColor: "var(--wgi-border)",
  color: "var(--wgi-text)",
};

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold" style={{ color: "var(--wgi-text)" }}>
        {title}
      </h2>
      <p className="text-sm mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
        {description}
      </p>
    </div>
  );
}

interface ToastState { message: string; kind: "success" | "error" }

// ---------------------------------------------------------------------------
// Platforms section
// ---------------------------------------------------------------------------

function PlatformsSection() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Add form
  const [addOpen, setAddOpen] = useState(false);
  const [addCode, setAddCode] = useState("");
  const [addName, setAddName] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Edit inline state: id → draft name
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  function showToast(message: string, kind: ToastState["kind"]) {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  }

  const reload = useCallback(async () => {
    setLoading(true);
    const headers = await authHeaders();
    const res = await fetch("/api/admin/settings/platforms", { headers });
    if (res.ok) setPlatforms(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/settings/platforms", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: addCode, name: addName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast("Platform added", "success");
      setAddOpen(false);
      setAddCode(""); setAddName("");
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add", "error");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleSaveName(platform: Platform) {
    const name = editing[platform.id]?.trim();
    if (!name || name === platform.name) { setEditing((e) => { const n = { ...e }; delete n[platform.id]; return n; }); return; }
    setSavingId(platform.id);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/settings/platforms/${platform.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast("Platform updated", "success");
      setEditing((e) => { const n = { ...e }; delete n[platform.id]; return n; });
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update", "error");
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggleActive(platform: Platform) {
    const headers = await authHeaders();
    await fetch(`/api/admin/settings/platforms/${platform.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ is_active: !platform.is_active }),
    });
    await reload();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionHeader
          title="Platforms"
          description="Insurance and investment platforms that appear in commission data"
        />
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity"
          style={{ background: "var(--wgi-navy)" }}
        >
          <IconPlus size={14} /> Add Platform
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--wgi-text-muted)" }}>Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--wgi-border)", background: "var(--wgi-bg)" }}>
                {["Code", "Name", "Status", "Actions"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide ${i === 3 ? "text-right" : ""}`}
                    style={{ color: "var(--wgi-text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {platforms.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50/60 transition-colors" style={{ borderColor: "var(--wgi-border)" }}>
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100" style={{ color: "var(--wgi-text)" }}>
                      {p.code}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {editing[p.id] !== undefined ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editing[p.id]}
                          onChange={(e) => setEditing((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          className="px-2.5 py-1.5 text-sm border rounded-lg focus:outline-none"
                          style={inputStyle}
                        />
                        <button onClick={() => handleSaveName(p)} disabled={savingId === p.id} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40">
                          <IconCheck size={15} />
                        </button>
                        <button onClick={() => setEditing((e) => { const n = { ...e }; delete n[p.id]; return n; })} className="p-1" style={{ color: "var(--wgi-text-muted)" }}>
                          <IconX size={15} />
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: "var(--wgi-text)" }}>{p.name}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${p.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditing((prev) => ({ ...prev, [p.id]: p.name }))}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg hover:bg-gray-50 transition-colors"
                        style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
                      >
                        <IconPencil size={11} /> Rename
                      </button>
                      <button
                        onClick={() => handleToggleActive(p)}
                        className={`px-2.5 py-1.5 text-xs border rounded-lg transition-colors ${p.is_active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
                      >
                        {p.is_active ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add platform inline form */}
      {addOpen && (
        <form onSubmit={handleAdd} className="mt-3 flex items-end gap-3 p-4 bg-white rounded-xl border" style={{ borderColor: "var(--wgi-border)" }}>
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--wgi-text)" }}>Code</label>
            <input required value={addCode} onChange={(e) => setAddCode(e.target.value)} placeholder="RL360" className={inputClass} style={inputStyle} />
          </div>
          <div className="flex-[2]">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--wgi-text)" }}>Name</label>
            <input required value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="RL360 International" className={inputClass} style={inputStyle} />
          </div>
          <div className="flex gap-2 pb-0.5">
            <button type="submit" disabled={addLoading} className="px-4 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60" style={{ background: "var(--wgi-navy)" }}>
              {addLoading ? "Adding…" : "Add"}
            </button>
            <button type="button" onClick={() => setAddOpen(false)} className="px-4 py-2.5 text-sm border rounded-lg hover:bg-gray-50 transition-colors" style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-full text-white text-sm shadow-xl ${toast.kind === "success" ? "bg-slate-900" : "bg-red-600"}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commission Types section
// ---------------------------------------------------------------------------

function CommissionTypesSection() {
  const [types, setTypes] = useState<CommissionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addCode, setAddCode] = useState("");
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  function showToast(message: string, kind: ToastState["kind"]) {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  }

  const reload = useCallback(async () => {
    setLoading(true);
    const headers = await authHeaders();
    const res = await fetch("/api/admin/settings/commission-types", { headers });
    if (res.ok) setTypes(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/settings/commission-types", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: addCode, name: addName, description: addDesc || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast("Commission type added", "success");
      setAddOpen(false);
      setAddCode(""); setAddName(""); setAddDesc("");
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add", "error");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleToggle(ct: CommissionType) {
    const headers = await authHeaders();
    await fetch(`/api/admin/settings/commission-types/${ct.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ is_active: !ct.is_active }),
    });
    await reload();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionHeader
          title="Commission Types"
          description="Types of commission processed by the system (initial, renewal, trail, etc.)"
        />
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity"
          style={{ background: "var(--wgi-navy)" }}
        >
          <IconPlus size={14} /> Add Type
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--wgi-text-muted)" }}>Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--wgi-border)", background: "var(--wgi-bg)" }}>
                {["Code", "Name", "Description", "Status", ""].map((h, i) => (
                  <th key={i} className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide ${i === 4 ? "text-right" : ""}`} style={{ color: "var(--wgi-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {types.map((ct) => (
                <tr key={ct.id} className="border-b last:border-0 hover:bg-slate-50/60 transition-colors" style={{ borderColor: "var(--wgi-border)" }}>
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100" style={{ color: "var(--wgi-text)" }}>{ct.code}</span>
                  </td>
                  <td className="px-5 py-3 font-medium" style={{ color: "var(--wgi-text)" }}>{ct.name}</td>
                  <td className="px-5 py-3 text-xs" style={{ color: "var(--wgi-text-muted)" }}>{ct.description ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${ct.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {ct.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleToggle(ct)}
                      className={`px-2.5 py-1.5 text-xs border rounded-lg transition-colors ${ct.is_active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
                    >
                      {ct.is_active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {addOpen && (
        <form onSubmit={handleAdd} className="mt-3 flex flex-wrap items-end gap-3 p-4 bg-white rounded-xl border" style={{ borderColor: "var(--wgi-border)" }}>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--wgi-text)" }}>Code</label>
            <input required value={addCode} onChange={(e) => setAddCode(e.target.value)} placeholder="INITIAL" className={inputClass} style={{ ...inputStyle, minWidth: "110px" }} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--wgi-text)" }}>Name</label>
            <input required value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Initial Commission" className={inputClass} style={inputStyle} />
          </div>
          <div className="flex-[2] min-w-[180px]">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--wgi-text)" }}>Description (optional)</label>
            <input value={addDesc} onChange={(e) => setAddDesc(e.target.value)} placeholder="Commission paid on policy commencement" className={inputClass} style={inputStyle} />
          </div>
          <div className="flex gap-2 pb-0.5">
            <button type="submit" disabled={addLoading} className="px-4 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60" style={{ background: "var(--wgi-navy)" }}>
              {addLoading ? "Adding…" : "Add"}
            </button>
            <button type="button" onClick={() => setAddOpen(false)} className="px-4 py-2.5 text-sm border rounded-lg hover:bg-gray-50 transition-colors" style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 rounded-full text-white text-sm shadow-xl ${toast.kind === "success" ? "bg-slate-900" : "bg-red-600"}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// System Settings section
// ---------------------------------------------------------------------------

function SystemSettingsSection() {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<ToastState | null>(null);

  function showToast(message: string, kind: ToastState["kind"]) {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  }

  const reload = useCallback(async () => {
    setLoading(true);
    const headers = await authHeaders();
    const res = await fetch("/api/admin/settings", { headers });
    if (res.ok) {
      const json = await res.json();
      setSettings(json.raw ?? []);
      const initial: Record<string, string> = {};
      for (const s of json.raw ?? []) {
        initial[s.key] = String(s.value);
      }
      setDrafts(initial);
    }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function handleSave(key: string) {
    setSaving(key);
    try {
      const headers = await authHeaders();
      const raw = drafts[key];
      // Coerce to correct type
      let value: unknown = raw;
      if (raw === "true") value = true;
      else if (raw === "false") value = false;
      else if (!isNaN(Number(raw)) && raw.trim() !== "") value = Number(raw);

      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast("Setting saved", "success");
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="p-4 text-sm" style={{ color: "var(--wgi-text-muted)" }}>Loading…</div>;

  return (
    <div>
      <SectionHeader
        title="System Settings"
        description="Platform-wide configuration defaults applied to new accounts and commission workflows"
      />

      <div className="bg-white rounded-xl border overflow-hidden divide-y" style={{ borderColor: "var(--wgi-border)" }}>
        {settings.map((s) => (
          <div key={s.key} className="px-5 py-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: "var(--wgi-text)" }}>
                {s.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </p>
              {s.description && (
                <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>{s.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <input
                value={drafts[s.key] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                className="px-3 py-1.5 text-sm border rounded-lg focus:outline-none w-36"
                style={inputStyle}
              />
              <button
                onClick={() => handleSave(s.key)}
                disabled={saving === s.key || String(s.value) === drafts[s.key]}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-40 transition-opacity"
                style={{ background: "var(--wgi-navy)" }}
              >
                {saving === s.key ? "Saving…" : <><IconCheck size={12} /> Save</>}
              </button>
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 rounded-full text-white text-sm shadow-xl ${toast.kind === "success" ? "bg-slate-900" : "bg-red-600"}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root export — tab layout
// ---------------------------------------------------------------------------

type Tab = "platforms" | "commission-types" | "system";

export default function SettingsPanel() {
  const [tab, setTab] = useState<Tab>("platforms");

  const tabs: { id: Tab; label: string }[] = [
    { id: "platforms", label: "Platforms" },
    { id: "commission-types", label: "Commission Types" },
    { id: "system", label: "System Settings" },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: "var(--wgi-border)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 ${
              tab === t.id ? "border-current" : "border-transparent hover:border-gray-200"
            }`}
            style={{
              color: tab === t.id ? "var(--wgi-navy)" : "var(--wgi-text-muted)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "platforms" && <PlatformsSection />}
      {tab === "commission-types" && <CommissionTypesSection />}
      {tab === "system" && <SystemSettingsSection />}
    </div>
  );
}
