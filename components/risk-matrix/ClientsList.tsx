"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RiskPill from "@/components/risk-matrix/RiskPill";
import { fmtDate, fmtNum, todayISO } from "@/lib/risk-matrix/format";
import type { ClientSummary } from "@/lib/risk-matrix/types";

const LEVELS = ["Bajo", "Medio", "Alto", "Declinado"];

const HEADERS: Array<{ label: string; right?: boolean }> = [
  { label: "ID" },
  { label: "Cliente" },
  { label: "Clasificación" },
  { label: "Score", right: true },
  { label: "Última evaluación" },
  { label: "Próxima revisión" },
  { label: "Evaluado por" },
];

interface ClientsListProps {
  clients: ClientSummary[];
}

export default function ClientsList({ clients }: ClientsListProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  // Resolved after mount so "overdue" follows the browser's date, not the server's
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayISO()), []);

  const isLate = (c: ClientSummary) =>
    !!today && !!c.next_review_date && c.next_review_date < today;

  const q = search.trim().toLowerCase();
  const filtered = clients.filter(
    (c) => !q || `${c.client_ref} ${c.name}`.toLowerCase().includes(q)
  );

  const newButton = (label: string) => (
    <Link
      href="/risk-matrix/new"
      className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap"
      style={{ background: "var(--wgi-navy)" }}
    >
      {label}
    </Link>
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
            Clientes evaluados
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
            Evaluación de Riesgo PLAyFT — clasificación de clientes
          </p>
        </div>
        {newButton("+ Nueva evaluación")}
      </div>

      {clients.length === 0 ? (
        <div
          className="text-center py-16 px-6 rounded-xl border"
          style={{ borderColor: "var(--wgi-border)", background: "white" }}
        >
          <p className="text-sm font-medium mb-1" style={{ color: "var(--wgi-text)" }}>
            Aún no hay evaluaciones
          </p>
          <p className="text-sm mb-5 max-w-md mx-auto" style={{ color: "var(--wgi-text-muted)" }}>
            Cada evaluación guardada aparece aquí con su clasificación y la fecha de su
            próxima revisión.
          </p>
          {newButton("Evaluar primer cliente")}
        </div>
      ) : (
        <>
          {/* ── Stats ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <div
              className="rounded-xl border px-5 py-4"
              style={{ borderColor: "var(--wgi-border)", background: "white" }}
            >
              <p className="rm-num text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
                {clients.length}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--wgi-text-muted)" }}>
                Clientes
              </p>
            </div>
            {LEVELS.map((level) => (
              <div
                key={level}
                className="rounded-xl border px-5 py-4"
                style={{ borderColor: "var(--wgi-border)", background: "white" }}
              >
                <p className="rm-num text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
                  {clients.filter((c) => c.final_classification === level).length}
                </p>
                <div className="mt-1">
                  <RiskPill value={level} />
                </div>
              </div>
            ))}
            <div
              className="rounded-xl border px-5 py-4"
              style={{ borderColor: "var(--wgi-border)", background: "white" }}
            >
              <p className="rm-num text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
                {clients.filter(isLate).length}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--wgi-text-muted)" }}>
                Revisiones vencidas
              </p>
            </div>
          </div>

          {/* ── Table ── */}
          <div className="flex flex-col gap-4">
            <input
              type="search"
              placeholder="Buscar por ID o nombre…"
              aria-label="Buscar cliente"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-sm px-4 py-2 rounded-lg border text-sm focus:outline-none"
              style={{
                borderColor: "var(--wgi-border)",
                color: "var(--wgi-text)",
                background: "white",
              }}
            />

            <div
              className="rounded-xl border overflow-x-auto"
              style={{ borderColor: "var(--wgi-border)", background: "white" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--wgi-bg)", borderBottom: "1px solid var(--wgi-border)" }}>
                    {HEADERS.map((h) => (
                      <th
                        key={h.label}
                        className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${h.right ? "text-right" : "text-left"}`}
                        style={{ color: "var(--wgi-text-muted)" }}
                      >
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => {
                    const late = isLate(c);
                    const href = `/risk-matrix/clients/${c.id}`;
                    return (
                      <tr
                        key={c.id}
                        tabIndex={0}
                        onClick={() => router.push(href)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") router.push(href);
                        }}
                        className="cursor-pointer transition-opacity hover:opacity-80"
                        style={{
                          background: i % 2 === 0 ? "white" : "var(--wgi-bg)",
                          borderBottom: "1px solid var(--wgi-border)",
                        }}
                      >
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--wgi-text-muted)" }}>
                          {c.client_ref}
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: "var(--wgi-text)" }}>
                          {c.name}
                        </td>
                        <td className="px-4 py-3">
                          <RiskPill value={c.final_classification} />
                        </td>
                        <td className="rm-num px-4 py-3 text-right" style={{ color: "var(--wgi-text)" }}>
                          {fmtNum(c.score)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--wgi-text-muted)" }}>
                          {fmtDate(c.evaluation_date)}
                        </td>
                        <td
                          className={`px-4 py-3 whitespace-nowrap ${late ? "font-semibold" : ""}`}
                          style={{ color: late ? "var(--rm-alto)" : "var(--wgi-text-muted)" }}
                        >
                          {c.next_review_date
                            ? fmtDate(c.next_review_date) + (late ? " (vencida)" : "")
                            : "—"}
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--wgi-text-muted)" }}>
                          {c.evaluator_name ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filtered.length === 0 && (
                <div className="py-8 text-center text-sm" style={{ color: "var(--wgi-text-muted)" }}>
                  Ningún cliente coincide con «{search}».
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
