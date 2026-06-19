"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  IconPlus, IconEdit, IconTrash,
  IconCheck, IconX, IconLoader2, IconSearch,
} from "@tabler/icons-react";
import {
  parseFundIdentifier,
  isValidFundIdentifier,
  formatFundIdentifier,
} from "@/lib/fund-identifiers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Plat { id: string; name: string; slug: string }
interface Prof { id: string; label: string; name: string }

interface HoldingRow {
  isin:    string;
  name:    string;
  fundId:  string | null;   // null = new (will be registered on save)
  weight:  number;          // 0–1
  status:  "idle" | "loading" | "found" | "new" | "error";
}

interface CompositionRecord {
  id: string;
  effective_from: string;
  effective_to:   string | null;
  notes:          string | null;
  mp_composition_holdings: Array<{
    id: string; weight: number; fund_id: string;
    mp_funds: { isin: string; display_name: string } | null;
  }>;
}

interface Props {
  platforms: Plat[];
  profiles:  Prof[];
  funds:     Array<{ id: string; isin: string; display_name: string }>;
  onSaved?:  () => void;
  /** Pre-select platform/profile when opened from history view */
  initialPlatformId?:    string;
  initialProfileId?:     string;
  initialCompositionId?: string;
  autoOpenForm?:         boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(d: string | null) {
  if (!d) return "Current";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Individual holding row — ISIN or ETF ticker with live lookup
// ---------------------------------------------------------------------------

function HoldingIdentifierRow({
  row, onChange, onRemove,
}: {
  row: HoldingRow;
  onChange: (updated: HoldingRow) => void;
  onRemove: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function lookupIdentifier(raw: string) {
    const parsed = parseFundIdentifier(raw);
    if (!parsed) return;
    onChange({ ...row, isin: parsed.value, status: "loading", name: "", fundId: null });

    try {
      const res  = await fetch(`/api/model-portfolio/admin/funds/lookup?q=${encodeURIComponent(parsed.value)}`);
      const data = await res.json();
      if (data.found) {
        onChange({
          ...row,
          isin:   formatFundIdentifier(data.fund.isin),
          status: "found",
          name:   data.fund.display_name,
          fundId: data.fund.id,
        });
      } else {
        onChange({
          ...row,
          isin:   parsed.value,
          status: "new",
          name:   data.suggestion?.name ?? "",
          fundId: null,
        });
      }
    } catch {
      onChange({ ...row, isin: parsed.value, status: "error", name: "", fundId: null });
    }
  }

  function handleIdentifierChange(val: string) {
    const upper = val.toUpperCase();
    onChange({ ...row, isin: upper, status: "idle", name: "", fundId: null });
    if (timer.current) clearTimeout(timer.current);

    const parsed = parseFundIdentifier(upper);
    if (!parsed) return;

    if (parsed.type === "isin" && upper.length === 12) {
      timer.current = setTimeout(() => lookupIdentifier(upper), 400);
    } else if (parsed.type === "ticker" && upper.length >= 2) {
      timer.current = setTimeout(() => lookupIdentifier(upper), 600);
    }
  }

  const borderColor = {
    idle:    "var(--wgi-border)",
    loading: "var(--wgi-border)",
    found:   "var(--mp-gain, #00873E)",
    new:     "#f59e0b",
    error:   "var(--mp-loss, #CC0000)",
  }[row.status];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {/* ISIN input */}
        <div className="relative flex-1">
          <input
            type="text"
            value={row.isin}
            onChange={(e) => handleIdentifierChange(e.target.value)}
            placeholder="ISIN or ticker (e.g. IE00B3BRDK12, VOO)"
            maxLength={20}
            className="w-full text-xs border rounded-lg px-3 py-2 font-mono uppercase pr-8"
            style={{ borderColor, color: "var(--wgi-text)" }}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {row.status === "loading" && <IconLoader2 size={13} className="animate-spin text-slate-400" />}
            {row.status === "found"   && <IconCheck   size={13} className="text-emerald-500" />}
            {row.status === "new"     && <IconSearch  size={13} className="text-amber-500" />}
            {row.status === "error"   && <IconX       size={13} className="text-red-500" />}
          </span>
        </div>

        {/* Weight */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            type="number"
            min={0} max={100} step={1}
            value={Math.round(row.weight * 100) || ""}
            onChange={(e) => onChange({ ...row, weight: (parseFloat(e.target.value) || 0) / 100 })}
            placeholder="0"
            className="w-16 text-xs border rounded-lg px-2 py-2 text-right"
            style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
          />
          <span className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>%</span>
        </div>

        {/* Remove */}
        <button onClick={onRemove} className="flex-shrink-0 text-slate-300 hover:text-red-400 transition-colors">
          <IconX size={14} />
        </button>
      </div>

      {/* Fund name / status hint */}
      {row.status === "found" && row.name && (
        <p className="text-[11px] pl-1" style={{ color: "var(--mp-gain, #00873E)" }}>✓ {row.name}</p>
      )}
      {row.status === "new" && (
        <p className="text-[11px] pl-1" style={{ color: "#f59e0b" }}>
          ⚠ Not in registry — will be registered automatically on save
          {row.name ? ` as "${row.name}"` : ""}
        </p>
      )}
      {row.status === "error" && (
        <p className="text-[11px] pl-1 text-red-400">Lookup failed — check the ISIN or ticker</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composition form (add / edit)
// ---------------------------------------------------------------------------

function CompositionForm({
  platforms, profiles,
  initial,
  presetPlatformId,
  presetProfileId,
  onSave, onCancel,
}: {
  platforms: Plat[];
  profiles:  Prof[];
  initial?: { composition: CompositionRecord; platformId: string; profileId: string };
  presetPlatformId?: string;
  presetProfileId?:  string;
  onSave:   () => void;
  onCancel: () => void;
}) {
  const [platformId,    setPlatformId]    = useState(initial?.platformId ?? presetPlatformId ?? "");
  const [profileId,     setProfileId]     = useState(initial?.profileId  ?? presetProfileId  ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.composition.effective_from ?? "");
  const [notes,         setNotes]         = useState(initial?.composition.notes ?? "");
  const [holdings,      setHoldings]      = useState<HoldingRow[]>(() => {
    if (!initial) return [{ isin: "", name: "", fundId: null, weight: 0, status: "idle" }];
    return initial.composition.mp_composition_holdings.map((h) => ({
      isin:   formatFundIdentifier(h.mp_funds?.isin ?? ""),
      name:   h.mp_funds?.display_name ?? "",
      fundId: h.fund_id,
      weight: h.weight,
      status: "found" as const,
    }));
  });

  const [currentComp,  setCurrentComp]  = useState<string | null>(null); // label of composition being superseded
  const [saving,       setSaving]        = useState(false);
  const [error,        setError]         = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    if (presetPlatformId) setPlatformId(presetPlatformId);
    if (presetProfileId)  setProfileId(presetProfileId);
  }, [presetPlatformId, presetProfileId, initial]);

  // When platform+profile+date change, look up whether there's an active composition to supersede
  useEffect(() => {
    if (!platformId || !profileId || !effectiveFrom || initial) { setCurrentComp(null); return; }
    (async () => {
      const res  = await fetch(
        `/api/model-portfolio/admin/compositions?platform=${platformId}&profile=${profileId}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      const active = Array.isArray(data) ? data.find((c: CompositionRecord) => !c.effective_to) : null;
      setCurrentComp(active ? `effective from ${fmt(active.effective_from)}` : null);
    })();
  }, [platformId, profileId, effectiveFrom, initial]);

  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  const weightOk    = Math.abs(totalWeight - 1) < 0.005;

  async function handleSave() {
    if (!platformId || !profileId || !effectiveFrom) {
      setError("Platform, profile and effective date are required."); return;
    }
    if (holdings.some((h) => !isValidFundIdentifier(h.isin))) {
      setError("Each holding must be a valid ISIN or ETF ticker."); return;
    }
    if (holdings.some((h) => h.status === "loading")) {
      setError("Please wait for fund lookups to complete."); return;
    }
    if (!weightOk) {
      setError(`Weights sum to ${(totalWeight * 100).toFixed(1)}% — must equal 100%.`); return;
    }

    setSaving(true); setError(null);

    try {
      // Register any new ISINs first
      const resolvedHoldings = await Promise.all(
        holdings.map(async (h) => {
          if (h.fundId) return { fundId: h.fundId, weight: h.weight };
          // Register new ISIN
          const res  = await fetch("/api/model-portfolio/admin/funds/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ isin: h.isin, displayName: h.name || undefined }),
          });
          const data = await res.json();
          if (!data.fund?.id) throw new Error(`Could not register ${h.isin}`);
          return { fundId: data.fund.id, weight: h.weight };
        })
      );

      const url    = initial
        ? `/api/model-portfolio/admin/compositions?id=${initial.composition.id}`
        : `/api/model-portfolio/admin/compositions`;
      const method = initial ? "PUT" : "POST";

      const res  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ platformId, profileId, effectiveFrom, notes, holdings: resolvedHoldings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border p-6 space-y-5" style={{ background: "white", borderColor: "var(--wgi-border)" }}>
      <p className="text-base font-bold" style={{ color: "var(--wgi-text)" }}>
        {initial ? "Edit Composition" : "New Composition"}
      </p>

      {/* Platform + Profile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: "var(--wgi-text-muted)" }}>Platform</label>
          <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} disabled={!!initial}
            className="w-full text-sm border rounded-lg px-3 py-2"
            style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>
            <option value="">— Select —</option>
            {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: "var(--wgi-text-muted)" }}>Profile</label>
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} disabled={!!initial}
            className="w-full text-sm border rounded-lg px-3 py-2"
            style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>
            <option value="">— Select —</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>Perfil {p.label} — {p.name}</option>)}
          </select>
        </div>
      </div>

      {/* Effective From + Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: "var(--wgi-text-muted)" }}>Effective From</label>
          <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)}
            className="w-full text-sm border rounded-lg px-3 py-2"
            style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }} />
          {/* Continuity notice */}
          {currentComp && (
            <p className="text-[11px] mt-1" style={{ color: "#f59e0b" }}>
              ⚠ Will close the current composition ({currentComp}) on this date.
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: "var(--wgi-text-muted)" }}>Notes (optional)</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Q2 2025 rebalance"
            className="w-full text-sm border rounded-lg px-3 py-2"
            style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }} />
        </div>
      </div>

      {/* Holdings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold" style={{ color: "var(--wgi-text-muted)" }}>Holdings</label>
            {/* Weight total progress */}
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--wgi-border)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(totalWeight * 100, 100)}%`,
                    background: weightOk ? "var(--mp-gain, #00873E)" : totalWeight > 1 ? "var(--mp-loss, #CC0000)" : "#f59e0b",
                  }}
                />
              </div>
              <span
                className="text-xs font-semibold"
                style={{ color: weightOk ? "var(--mp-gain, #00873E)" : totalWeight > 1 ? "var(--mp-loss, #CC0000)" : "#f59e0b" }}
              >
                {(totalWeight * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <button
            onClick={() => setHoldings((h) => [...h, { isin: "", name: "", fundId: null, weight: 0, status: "idle" }])}
            className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition-colors hover:bg-slate-50"
            style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text-muted)" }}
          >
            <IconPlus size={12} /> Add holding
          </button>
        </div>

        <div className="space-y-3">
          {holdings.map((row, i) => (
            <HoldingIdentifierRow
              key={i}
              row={row}
              onChange={(updated) => setHoldings((h) => h.map((x, j) => j === i ? updated : x))}
              onRemove={() => setHoldings((h) => h.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--wgi-navy)" }}>
          {saving ? <IconLoader2 size={14} className="animate-spin" /> : <IconCheck size={14} />}
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm border transition-colors hover:bg-slate-50"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text-muted)" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CompositionManager({
  platforms, profiles, onSaved,
  initialPlatformId,
  initialProfileId,
  initialCompositionId,
  autoOpenForm,
}: Props) {
  const [selectedPlatform, setSelectedPlatform] = useState(initialPlatformId ?? platforms[0]?.id ?? "");
  const [selectedProfile,  setSelectedProfile]  = useState(initialProfileId ?? profiles[0]?.id  ?? "");
  const [compositions,     setCompositions]      = useState<CompositionRecord[]>([]);
  const [loading,          setLoading]           = useState(false);
  const [showForm,         setShowForm]          = useState(autoOpenForm ?? false);
  const [editTarget,       setEditTarget]        = useState<CompositionRecord | null>(null);

  useEffect(() => {
    if (initialPlatformId) setSelectedPlatform(initialPlatformId);
    if (initialProfileId)  setSelectedProfile(initialProfileId);
  }, [initialPlatformId, initialProfileId]);

  useEffect(() => {
    if (autoOpenForm) setShowForm(true);
  }, [autoOpenForm]);

  useEffect(() => {
    if (!initialCompositionId || !selectedPlatform || !selectedProfile) return;
    (async () => {
      const res  = await fetch(
        `/api/model-portfolio/admin/compositions?platform=${selectedPlatform}&profile=${selectedProfile}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      const match = Array.isArray(data)
        ? data.find((c: CompositionRecord) => c.id === initialCompositionId)
        : null;
      if (match) {
        setEditTarget(match);
        setShowForm(false);
      }
    })();
  }, [initialCompositionId, selectedPlatform, selectedProfile]);

  const loadCompositions = useCallback(async () => {
    if (!selectedPlatform || !selectedProfile) return;
    setLoading(true);
    const res  = await fetch(
      `/api/model-portfolio/admin/compositions?platform=${selectedPlatform}&profile=${selectedProfile}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    setCompositions(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [selectedPlatform, selectedProfile]);

  useEffect(() => { loadCompositions(); }, [loadCompositions]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this composition and all its holdings? This cannot be undone.")) return;
    await fetch(`/api/model-portfolio/admin/compositions?id=${id}`, { method: "DELETE" });
    loadCompositions();
    onSaved?.();
  }

  function handleSaved() {
    setShowForm(false); setEditTarget(null);
    loadCompositions();
    onSaved?.();
  }

  return (
    <div className="space-y-5">
      {/* Selector row */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: "var(--wgi-text-muted)" }}>Platform</label>
          <select value={selectedPlatform} onChange={(e) => setSelectedPlatform(e.target.value)}
            className="text-sm border rounded-lg px-3 py-2"
            style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>
            {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: "var(--wgi-text-muted)" }}>Profile</label>
          <select value={selectedProfile} onChange={(e) => setSelectedProfile(e.target.value)}
            className="text-sm border rounded-lg px-3 py-2"
            style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>
            {profiles.map((p) => <option key={p.id} value={p.id}>Perfil {p.label} — {p.name}</option>)}
          </select>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditTarget(null); }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: "var(--wgi-navy)" }}
        >
          <IconPlus size={14} /> New Composition
        </button>
      </div>

      {/* Form (add or edit) */}
      {(showForm || editTarget) && (
        <CompositionForm
          platforms={platforms} profiles={profiles}
          presetPlatformId={selectedPlatform}
          presetProfileId={selectedProfile}
          initial={editTarget
            ? { composition: editTarget, platformId: selectedPlatform, profileId: selectedProfile }
            : undefined}
          onSave={handleSaved}
          onCancel={() => { setShowForm(false); setEditTarget(null); }}
        />
      )}

      {/* Timeline */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
        <div className="px-5 py-4 border-b" style={{ background: "white", borderColor: "var(--wgi-border)" }}>
          <p className="text-base font-bold" style={{ color: "var(--wgi-text)" }}>Composition History</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
            {compositions.length} compositions · most recent first
          </p>
        </div>

        {loading ? (
          <div className="px-5 py-10 flex justify-center" style={{ background: "white" }}>
            <IconLoader2 size={20} className="animate-spin" style={{ color: "var(--wgi-text-muted)" }} />
          </div>
        ) : compositions.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ background: "white", color: "var(--wgi-text-muted)" }}>
            No compositions for this platform and profile. Use <strong>New Composition</strong> above to add one.
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ background: "white" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--wgi-border)" }}>
                  {["From", "To", "Funds", "Notes", ""].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--wgi-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compositions.map((c, idx) => (
                  <tr key={c.id}
                      className="border-b hover:bg-slate-50 transition-colors"
                      style={{ borderColor: "var(--wgi-border)", background: idx % 2 === 0 ? "white" : "#fafafa" }}>
                    <td className="px-5 py-3 font-semibold text-sm" style={{ color: "var(--wgi-text)" }}>
                      {fmt(c.effective_from)}
                    </td>
                    <td className="px-5 py-3 text-sm font-semibold"
                        style={{ color: c.effective_to ? "var(--wgi-text)" : "var(--mp-gain, #00873E)" }}>
                      {c.effective_to ? fmt(c.effective_to) : "Current"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="space-y-0.5">
                        {c.mp_composition_holdings.slice(0, 3).map((h) => (
                          <div key={h.id} className="flex items-center gap-2 text-xs">
                            <span className="font-mono" style={{ color: "var(--wgi-text-muted)" }}>
                              {formatFundIdentifier(h.mp_funds?.isin ?? "?")}
                            </span>
                            <span style={{ color: "var(--wgi-text)" }}>
                              {(h.weight * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                        {c.mp_composition_holdings.length > 3 && (
                          <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                            +{c.mp_composition_holdings.length - 3} more
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs max-w-[180px] truncate" style={{ color: "var(--wgi-text-muted)" }}>
                      {c.notes ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => { setEditTarget(c); setShowForm(false); }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" title="Edit">
                          <IconEdit size={14} style={{ color: "var(--wgi-text-muted)" }} />
                        </button>
                        <button onClick={() => handleDelete(c.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Delete">
                          <IconTrash size={14} className="text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
