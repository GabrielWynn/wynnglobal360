"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RiskPill from "@/components/risk-matrix/RiskPill";
import { CFG } from "@/lib/risk-matrix/config";
import { fmtDate, todayISO } from "@/lib/risk-matrix/format";
import { REVIEW_NOTICE_DAYS, addDaysISO, daysBetween } from "@/lib/risk-matrix/reviews";
import type { ClientSummary } from "@/lib/risk-matrix/types";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "en 12 días" up to two months out, then "en 14 meses". */
function untilLabel(days: number): string {
  if (days === 0) return "hoy";
  if (days <= 60) return `en ${plural(days, "día", "días")}`;
  return `en ${plural(Math.round(days / 30.44), "mes", "meses")}`;
}

interface ReviewsListProps {
  /** Every client with a scheduled review, soonest first. */
  clients: ClientSummary[];
  /** Server's date; replaced by the browser's after mount. */
  today: string;
}

export default function ReviewsList({ clients, today: serverToday }: ReviewsListProps) {
  const [today, setToday] = useState(serverToday);
  useEffect(() => setToday(todayISO()), []);

  const horizon = addDaysISO(today, REVIEW_NOTICE_DAYS);
  const scheduled = clients.filter((c) => c.next_review_date);
  const overdue = scheduled.filter((c) => c.next_review_date! < today);
  const upcoming = scheduled.filter(
    (c) => c.next_review_date! >= today && c.next_review_date! <= horizon
  );
  const later = scheduled.filter((c) => c.next_review_date! > horizon);

  const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap";

  function table(rows: ClientSummary[], late: boolean) {
    return (
      <div
        className="rounded-xl border overflow-x-auto"
        style={{ borderColor: "var(--wgi-border)", background: "white" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              style={{
                background: "var(--wgi-bg)",
                borderBottom: "1px solid var(--wgi-border)",
                color: "var(--wgi-text-muted)",
              }}
            >
              <th className={th}>ID</th>
              <th className={th}>Cliente</th>
              <th className={th}>Clasificación</th>
              <th className={th}>Última evaluación</th>
              <th className={th}>Revisión</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => {
              const days = daysBetween(today, c.next_review_date!);
              const when = late ? `hace ${plural(-days, "día", "días")}` : untilLabel(days);
              return (
                <tr
                  key={c.id}
                  style={{
                    background: i % 2 === 0 ? "white" : "var(--wgi-bg)",
                    borderBottom: "1px solid var(--wgi-border)",
                  }}
                >
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--wgi-text-muted)" }}>
                    {c.client_ref}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/risk-matrix/clients/${c.id}`}
                      className="hover:underline"
                      style={{ color: "var(--wgi-text)" }}
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <RiskPill value={c.final_classification} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--wgi-text-muted)" }}>
                    {fmtDate(c.evaluation_date)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={late ? "font-semibold" : ""}
                      style={{ color: late ? "var(--rm-alto)" : "var(--wgi-text)" }}
                    >
                      {fmtDate(c.next_review_date)}
                    </span>{" "}
                    <span className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                      ({when})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/risk-matrix/new?client=${c.id}`}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 whitespace-nowrap"
                      style={{ background: "var(--wgi-navy)", color: "white" }}
                    >
                      Reevaluar
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const intervals = CFG.debida_diligencia
    .filter((d) => d.revision_meses)
    .map((d) => {
      const years = d.revision_meses! / 12;
      return `${d.clasificacion}: ${years === 1 ? "cada año" : `cada ${years} años`}`;
    })
    .reverse()
    .join(" · ");

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
          Revisiones
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
          {intervals}. La fecha se cuenta desde la última evaluación del cliente.
        </p>
      </div>

      {scheduled.length === 0 ? (
        <div
          className="text-center py-16 px-6 rounded-xl border"
          style={{ borderColor: "var(--wgi-border)", background: "white" }}
        >
          <p className="text-sm font-medium mb-1" style={{ color: "var(--wgi-text)" }}>
            No hay revisiones programadas
          </p>
          <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
            Cada cliente evaluado como Bajo, Medio o Alto aparece aquí con la fecha de su
            próxima revisión.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {overdue.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-3" style={{ color: "var(--rm-alto)" }}>
                Vencidas ({overdue.length})
              </h2>
              {table(overdue, true)}
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-3" style={{ color: "var(--wgi-text)" }}>
                Próximos {REVIEW_NOTICE_DAYS} días ({upcoming.length})
              </h2>
              {table(upcoming, false)}
            </section>
          )}
          {later.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-3" style={{ color: "var(--wgi-text)" }}>
                Más adelante ({later.length})
              </h2>
              {table(later, false)}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
