"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconRefresh, IconDatabase, IconLoader2, IconCheck, IconX,
} from "@tabler/icons-react";
import PortfolioHistoryView from "@/components/model-portfolio/PortfolioHistoryView";
import CompositionManager   from "@/components/model-portfolio/CompositionManager";
import PlatformManager      from "@/components/model-portfolio/PlatformManager";

interface Props {
  profiles:  Array<{ id: string; label: string; name: string }>;
  platforms: Array<{ id: string; name: string; slug: string }>;
  funds:     Array<{ id: string; isin: string; display_name: string }>;
}

type SyncState = "idle" | "loading" | "ok" | "error";

function SyncToolbar() {
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncMsg,   setSyncMsg]   = useState("");
  const [seedState, setSeedState] = useState<SyncState>("idle");
  const [seedMsg,   setSeedMsg]   = useState("");

  async function runSync() {
    setSyncState("loading"); setSyncMsg("");
    try {
      const res  = await fetch("/api/model-portfolio/admin/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncState("ok");
        const f = data.results?.funds ?? {};
        const yahoo = f.yahooUpdated ? ` · Yahoo ${f.yahooUpdated}` : "";
        setSyncMsg(
          `${f.active ?? 0} active · FT ${f.ftUpdated ?? 0}${yahoo}` +
          (f.skipped ? ` · ${f.skipped} skipped` : "")
        );
      } else {
        setSyncState("error"); setSyncMsg(data.error ?? "Failed");
      }
    } catch {
      setSyncState("error"); setSyncMsg("Network error");
    }
  }

  async function runSeed() {
    setSeedState("loading"); setSeedMsg("");
    try {
      const res  = await fetch("/api/model-portfolio/admin/funds/seed-active", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSeedState("ok");
        setSeedMsg(`${data.fundsProcessed} funds · ${(data.totalInserted ?? 0).toLocaleString()} rows`);
      } else {
        setSeedState("error"); setSeedMsg(data.error ?? "Failed");
      }
    } catch {
      setSeedState("error"); setSeedMsg("Network error");
    }
  }

  function icon(state: SyncState) {
    if (state === "loading") return <IconLoader2 size={13} className="animate-spin" />;
    if (state === "ok")      return <IconCheck   size={13} className="text-emerald-400" />;
    if (state === "error")   return <IconX       size={13} className="text-red-400" />;
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={runSync}
          disabled={syncState === "loading"}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-slate-50 disabled:opacity-60"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
        >
          <IconRefresh size={13} className={syncState === "loading" ? "animate-spin" : ""} />
          Sync Prices
          {icon(syncState)}
        </button>
        {syncMsg && (
          <span className="text-[11px]" style={{ color: syncState === "error" ? "#ef4444" : "#10b981" }}>
            {syncMsg}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={runSeed}
          disabled={seedState === "loading"}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-slate-50 disabled:opacity-60"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
        >
          <IconDatabase size={13} />
          Seed Active Prices
          {icon(seedState)}
        </button>
        {seedMsg && (
          <span className="text-[11px]" style={{ color: seedState === "error" ? "#ef4444" : "#10b981" }}>
            {seedMsg}
          </span>
        )}
      </div>
    </div>
  );
}

type ManagerContext = {
  platformId: string;
  profileId: string;
  compositionId?: string;
  mode: "add" | "edit";
};

export default function AdminHistorySection({ profiles, platforms, funds }: Props) {
  const router = useRouter();
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id ?? "");
  const [historyKey,        setHistoryKey]         = useState(0);
  const [managerContext,    setManagerContext]     = useState<ManagerContext | null>(null);

  function scrollToForm() {
    setTimeout(() => {
      document.getElementById("composition-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function handleAddComp(platformId: string, profileId: string) {
    setManagerContext({ platformId, profileId, mode: "add" });
    scrollToForm();
  }

  function handleEditComp(compositionId: string, platformId: string, profileId: string) {
    setManagerContext({ platformId, profileId, compositionId, mode: "edit" });
    scrollToForm();
  }

  function handleSaved() {
    setHistoryKey((k) => k + 1);
    setManagerContext(null);
  }

  return (
    <div className="space-y-5">
      <PlatformManager platforms={platforms} onCreated={() => router.refresh()} />

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
          Prices sync daily via cron (FT Markets first, Yahoo Finance fallback). Use these buttons to sync or backfill manually.
        </p>
        <SyncToolbar />
      </div>

      <PortfolioHistoryView
        key={historyKey}
        profiles={profiles}
        profileId={selectedProfileId}
        onProfileChange={setSelectedProfileId}
        onEditComp={handleEditComp}
        onAddComp={handleAddComp}
      />

      {managerContext && (
        <div
          id="composition-form"
          className="rounded-2xl border"
          style={{ borderColor: "var(--wgi-border)", background: "white" }}
        >
          <CompositionManager
            key={`${managerContext.platformId}-${managerContext.profileId}-${managerContext.compositionId ?? "new"}`}
            profiles={profiles}
            platforms={platforms}
            funds={funds}
            initialPlatformId={managerContext.platformId}
            initialProfileId={managerContext.profileId}
            initialCompositionId={managerContext.compositionId}
            autoOpenForm={managerContext.mode === "add"}
            onSaved={handleSaved}
          />
        </div>
      )}
    </div>
  );
}
