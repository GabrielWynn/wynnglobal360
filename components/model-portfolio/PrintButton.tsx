"use client";

import { IconPrinter } from "@tabler/icons-react";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors hover:bg-slate-50 mp-no-print"
      style={{
        background:  "white",
        borderColor: "var(--wgi-border)",
        color:       "var(--wgi-text)",
      }}
    >
      <IconPrinter size={15} />
      Print
    </button>
  );
}
