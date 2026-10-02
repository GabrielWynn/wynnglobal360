"use client";

import { useEffect, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { getAuthHeaders } from "@/lib/supabase";
import type { Answers } from "@/lib/risk-matrix/engine";
import type { LacrmHints } from "@/lib/risk-matrix/lacrm-map";

/** A LACRM contact chosen to prefill the evaluation form. */
export interface LacrmPick {
  contactId: string;
  name: string;
  prefill: Answers;
  hints: LacrmHints;
}

interface Hit {
  contactId: string;
  clientNumber: string;
  name: string;
  planNumber: string;
  platform: string;
}

type Status = "idle" | "loading" | "empty" | "error";

interface LacrmLookupProps {
  onPick: (pick: LacrmPick) => void;
}

/** Optional search box: finds a client in LACRM and hands back mapped answers. */
export default function LacrmLookup({ onPick }: LacrmLookupProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  // Debounced search as the user types
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/risk-matrix/lacrm/search?q=${encodeURIComponent(q)}`, {
          headers,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { results: Hit[] };
        setHits(data.results);
        setStatus(data.results.length ? "idle" : "empty");
      } catch {
        if (controller.signal.aborted) return;
        setHits([]);
        setStatus("error");
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function pick(hit: Hit) {
    setStatus("loading");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/risk-matrix/lacrm/contacts/${hit.contactId}`, { headers });
      if (!res.ok) throw new Error();
      onPick((await res.json()) as LacrmPick);
      setQuery("");
    } catch {
      setStatus("error");
    }
  }

  const message =
    status === "loading"
      ? "Buscando…"
      : status === "empty"
        ? "Ningún cliente coincide en LACRM."
        : status === "error"
          ? "LACRM no disponible. Puedes completar los datos manualmente."
          : "Opcional. Rellena los datos que LACRM ya tiene; puedes editarlos después.";

  return (
    <div
      className="rounded-xl border px-5 py-4"
      style={{ borderColor: "var(--wgi-border)", background: "white" }}
    >
      <label
        htmlFor="rm_lacrm"
        className="text-sm font-medium"
        style={{ color: "var(--wgi-text)" }}
      >
        Buscar cliente en LACRM
      </label>

      <div className="relative mt-1.5">
        <IconSearch
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--wgi-text-light)" }}
        />
        <input
          id="rm_lacrm"
          type="search"
          className="rm-input"
          style={{ paddingLeft: 34 }}
          placeholder="Número de cliente, nombre o número de plan…"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {hits.length > 0 && (
          <ul
            className="absolute left-0 right-0 top-full mt-1 z-10 max-h-72 overflow-y-auto rounded-lg border shadow-lg"
            style={{ borderColor: "var(--wgi-border)", background: "white" }}
          >
            {hits.map((h) => (
              <li
                key={h.contactId}
                className="border-b last:border-b-0"
                style={{ borderColor: "var(--wgi-border)" }}
              >
                <button
                  type="button"
                  onClick={() => pick(h)}
                  className="w-full text-left px-3 py-2 transition-colors hover:bg-slate-50"
                >
                  <span className="block text-sm font-medium" style={{ color: "var(--wgi-text)" }}>
                    {h.name || "(sin nombre)"}
                  </span>
                  <span className="block text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                    {[
                      h.clientNumber && `ID ${h.clientNumber}`,
                      h.planNumber && `Plan ${h.planNumber}`,
                      h.platform,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Sin número de cliente"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p
        className="text-xs mt-1.5"
        style={{ color: status === "error" ? "var(--rm-alto)" : "var(--wgi-text-muted)" }}
      >
        {message}
      </p>
    </div>
  );
}
