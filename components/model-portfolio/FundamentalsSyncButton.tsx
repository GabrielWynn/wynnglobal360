"use client";

import { IconInfoCircle } from "@tabler/icons-react";

export default function FundamentalsSyncButton() {
  return (
    <div className="flex flex-col gap-2">
      <button
        disabled
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold opacity-60 cursor-not-allowed"
        style={{ background: "var(--wgi-navy)", color: "white" }}
      >
        Sync Look-Through Data
      </button>
      <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--wgi-text-muted)" }}>
        <IconInfoCircle size={13} />
        Disabled — EODHD subscription removed. Price sync uses FT Markets and Yahoo Finance.
      </p>
    </div>
  );
}
