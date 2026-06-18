"use client";

import { useState, useEffect } from "react";
import { IconLoader2, IconEdit, IconPlus } from "@tabler/icons-react";
import { profileColor } from "@/lib/mp-profiles";
import { formatFundIdentifier } from "@/lib/fund-identifiers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HoldingEntry {
  id:      string;
  weight:  number;
  fund_id: string;
  mp_funds: { isin: string; display_name: string } | null;
}

interface CompositionEntry {
  id:             string;
  effective_from: string;
  effective_to:   string | null;
  notes:          string | null;
  mp_composition_holdings: HoldingEntry[];
}

interface PlatformGroup {
  platform:     { id: string; name: string; slug: string };
  compositions: CompositionEntry[];
}

interface Profile { id: string; label: string; name: string }

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtDate(d: string | null): string {
  if (!d) return "Present";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Single composition version card
// ---------------------------------------------------------------------------

function CompositionCard({
  comp,
  profileLabel,
  onEdit,
}: {
  comp:         CompositionEntry;
  profileLabel: string;
  onEdit:       () => void;
}) {
  const isCurrent = !comp.effective_to;
  const sorted    = [...comp.mp_composition_holdings].sort((a, b) => b.weight - a.weight);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: isCurrent ? "var(--wgi-gold)" : "var(--wgi-border)",
        borderWidth:  isCurrent ? "1.5px" : "1px",
      }}
    >
      {/* Card header — date range */}
      <div
        className="px-3 py-2.5 flex items-center justify-between gap-2"
        style={{
          background:  isCurrent ? "#ecfdf5" : "var(--wgi-bg)",
          borderBottom: `1px solid ${isCurrent ? "#bbf7d0" : "var(--wgi-border)"}`,
        }}
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
             style={{ color: isCurrent ? "#065f46" : "var(--wgi-text-muted)" }}>
            Portfolio {profileLabel}{isCurrent && " · Current"}
          </p>
          <p className="text-xs font-semibold" style={{ color: "var(--wgi-text)" }}>
            <span style={{ color: "var(--wgi-text-muted)" }}>From: </span>{fmtDate(comp.effective_from)}
            {"  "}
            <span style={{ color: "var(--wgi-text-muted)" }}>To: </span>{fmtDate(comp.effective_to)}
          </p>
        </div>
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-white transition-colors flex-shrink-0"
          title="Edit composition"
        >
          <IconEdit size={13} style={{ color: "var(--wgi-text-muted)" }} />
        </button>
      </div>

      {/* Holdings table */}
      <div style={{ background: "white" }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--wgi-border)" }}>
              <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--wgi-text-muted)" }}>ISIN / Ticker</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--wgi-text-muted)" }}>Dist.</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => (
              <tr
                key={h.id}
                className="border-b last:border-0"
                style={{ borderColor: "var(--wgi-border)" }}
              >
                <td className="px-3 py-2">
                  <p className="font-mono text-[11px] font-semibold" style={{ color: "var(--wgi-navy)" }}>
                    {formatFundIdentifier(h.mp_funds?.isin ?? "—")}
                  </p>
                  <p className="text-[10px] truncate max-w-[140px] mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
                    {h.mp_funds?.display_name ?? "Unknown fund"}
                  </p>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="text-sm font-bold" style={{ color: "var(--wgi-text)" }}>
                    {Math.round(h.weight * 100)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  profiles:    Profile[];
  onEditComp?: (compositionId: string, platformId: string, profileId: string) => void;
  onAddComp?:  (platformId: string, profileId: string) => void;
  profileId:   string;
  onProfileChange: (id: string) => void;
}

export default function PortfolioHistoryView({
  profiles,
  onEditComp,
  onAddComp,
  profileId,
  onProfileChange,
}: Props) {
  const [groups,  setGroups]  = useState<PlatformGroup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    setLoading(true);
    fetch(`/api/model-portfolio/admin/compositions/history?profile=${profileId}`)
      .then((r) => r.json())
      .then(setGroups)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profileId]);

  const selectedProfile = profiles.find((p) => p.id === profileId);

  return (
    <div className="space-y-5">
      {/* Profile tab switcher */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold" style={{ color: "var(--wgi-text-muted)" }}>Profile:</span>
        <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
          {profiles.map((p, idx) => {
            const active = p.id === profileId;
            return (
              <button
                key={p.id}
                onClick={() => onProfileChange(p.id)}
                className="px-4 py-2 text-sm font-semibold transition-colors"
                style={{
                  background:  active ? profileColor(p.label) : "white",
                  color:       active ? "white" : "var(--wgi-text-muted)",
                  borderRight: idx < profiles.length - 1 ? "1px solid var(--wgi-border)" : undefined,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {selectedProfile && (
          <span className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
            Perfil {selectedProfile.label} — {selectedProfile.name}
          </span>
        )}
      </div>

      {/* Platform columns */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <IconLoader2 size={24} className="animate-spin" style={{ color: "var(--wgi-text-muted)" }} />
        </div>
      ) : (
        <div
          className="grid gap-5 overflow-x-auto pb-2"
          style={{
            gridTemplateColumns: `repeat(${Math.max(groups.length, 1)}, minmax(220px, 1fr))`,
          }}
        >
          {groups.map(({ platform, compositions }) => (
            <div key={platform.id} className="space-y-3 min-w-[220px]">
              {/* Platform label */}
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold" style={{ color: "var(--wgi-navy)" }}>
                  {platform.name}
                </h3>
                {onAddComp && (
                  <button
                    onClick={() => onAddComp(platform.id, profileId)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors hover:bg-slate-50"
                    style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text-muted)" }}
                    title="Add new composition"
                  >
                    <IconPlus size={11} /> New
                  </button>
                )}
              </div>

              {/* Composition cards stacked oldest → newest */}
              {compositions.length === 0 ? (
                <div
                  className="rounded-xl border p-4 text-center text-xs space-y-2"
                  style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text-muted)" }}
                >
                  <p>No compositions for this profile yet.</p>
                  {onAddComp && (
                    <button
                      onClick={() => onAddComp(platform.id, profileId)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors hover:bg-slate-50 mp-text-link"
                      style={{ borderColor: "var(--wgi-border)" }}
                    >
                      <IconPlus size={11} /> Add first composition
                    </button>
                  )}
                </div>
              ) : (
                compositions.map((comp) => (
                  <CompositionCard
                    key={comp.id}
                    comp={comp}
                    profileLabel={selectedProfile?.label ?? ""}
                    onEdit={() => onEditComp?.(comp.id, platform.id, profileId)}
                  />
                ))
              )}
            </div>
          ))}
        </div>
      )}

      {groups.length === 0 && !loading && (
        <p className="text-sm text-center py-8" style={{ color: "var(--wgi-text-muted)" }}>
          No platforms configured yet. Add a life company platform above, then create compositions for each profile.
        </p>
      )}
    </div>
  );
}
