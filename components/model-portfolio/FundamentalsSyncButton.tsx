"use client";

import { useState } from "react";
import { IconRefresh, IconLoader2, IconCheck, IconX } from "@tabler/icons-react";

type Status = "idle" | "loading" | "success" | "error";

interface SyncResult {
  updated: number;
  skipped: number;
  errors:  number;
}

export default function FundamentalsSyncButton() {
  const [status, setStatus]   = useState<Status>("idle");
  const [result, setResult]   = useState<SyncResult | null>(null);
  const [errMsg, setErrMsg]   = useState<string | null>(null);

  async function handleSync() {
    setStatus("loading");
    setResult(null);
    setErrMsg(null);

    try {
      const res = await fetch("/api/model-portfolio/admin/fundamentals/sync", {
        method: "POST",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setErrMsg(json.error ?? "Sync failed");
        setStatus("error");
        return;
      }

      setResult({
        updated: json.results.updated,
        skipped: json.results.skipped,
        errors:  json.results.errors,
      });
      setStatus("success");
    } catch {
      setErrMsg("Network error — check console for details");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleSync}
        disabled={status === "loading"}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60"
        style={{ background: "var(--wgi-accent)", color: "white" }}
      >
        {status === "loading" ? (
          <IconLoader2 size={15} className="animate-spin" />
        ) : (
          <IconRefresh size={15} />
        )}
        {status === "loading" ? "Syncing…" : "Sync Look-Through Data"}
      </button>

      {status === "success" && result && (
        <p className="flex items-center gap-1.5 text-xs" style={{ color: "#065f46" }}>
          <IconCheck size={13} />
          Done — {result.updated} updated, {result.skipped} skipped, {result.errors} errors
        </p>
      )}

      {status === "error" && (
        <p className="flex items-center gap-1.5 text-xs" style={{ color: "#991b1b" }}>
          <IconX size={13} />
          {errMsg}
        </p>
      )}
    </div>
  );
}
