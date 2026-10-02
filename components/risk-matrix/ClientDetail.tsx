"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import RiskPill, { levelKey } from "@/components/risk-matrix/RiskPill";
import ScoreScale from "@/components/risk-matrix/ScoreScale";
import { CFG } from "@/lib/risk-matrix/config";
import { ELEVAR_A_ALTO, type Answers, type StoredResult } from "@/lib/risk-matrix/engine";
import { fmtDate, fmtNum } from "@/lib/risk-matrix/format";
import type { EvaluationRecord, RiskClient } from "@/lib/risk-matrix/types";

/** Answer shown next to each sub-factor in the breakdown table. */
function subfactorValues(a: Answers, r: StoredResult): Record<string, string> {
  const join = (...v: Array<string | undefined>) => v.filter(Boolean).join(" / ");
  return {
    "Persona Políticamente Expuesta (PEP)": a.pep ?? "",
    "Coincidencias en listas / fuentes abiertas": a.hall ?? "",
    "Edad": r.rango_edad ?? "",
    "Estado civil": a.civil ?? "",
    "Profesión": a.prof ?? "",
    "Ocupación": a.ocup ?? "",
    "Actividad Economica": a.act ?? "",
    "Perfil de inversionista": a.perfil ?? "",
    "Tipo de Plan de inversión": a.tipo ?? "",
    "Estado del Plan": a.estado ?? "",
    "Monto del aporte": r.rango_monto
      ? `${a.moneda} ${fmtNum(Number(a.monto))} (${r.rango_monto})`
      : "",
    "Frecuencia del aporte": r.frecuencia_aplicada,
    "Metodo de Pago": a.metodo ?? "",
    "Nacionalidad": join(a.nac1, a.nac2),
    "País de Nacimiento": a.pnac ?? "",
    "País de domicilio": a.dom ?? "",
    "País de residencia fiscal": a.fis ?? "",
    "Origen de recursos": join(a.o1, a.o2),
    "Destino de recursos": a.dest ?? "",
    "Canal de vinculación": a.cv ?? "",
    "Canal de Operación": a.co ?? "",
  };
}

interface ClientDetailProps {
  client: RiskClient;
  evaluations: EvaluationRecord[];
  initialEvaluationId?: string;
}

export default function ClientDetail({ client, evaluations, initialEvaluationId }: ClientDetailProps) {
  const [selectedId, setSelectedId] = useState(initialEvaluationId ?? evaluations[0]?.id);
  const ev = evaluations.find((e) => e.id === selectedId) ?? evaluations[0];

  const back = (
    <Link
      href="/risk-matrix"
      className="inline-block text-sm mb-3 transition-opacity hover:opacity-70"
      style={{ color: "var(--wgi-text-muted)" }}
    >
      ← Volver a clientes
    </Link>
  );

  if (!ev) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        {back}
        <p className="text-sm" style={{ color: "var(--wgi-text)" }}>
          No se encontraron evaluaciones para este cliente.
        </p>
      </div>
    );
  }

  const r = ev.result;
  const a = ev.answers;
  const values = subfactorValues(a, r);
  const k = levelKey(r.final);

  const meta: Array<[string, string]> = [
    ["Fecha de evaluación", fmtDate(ev.evaluation_date)],
    ["Tipo", ev.evaluation_type],
    ["Evaluado por", ev.evaluator_name ?? "—"],
    ["Debida diligencia", r.debida_diligencia ?? "—"],
    ["Próxima revisión", fmtDate(r.proxima_revision)],
    ["Versión metodología", ev.methodology_version],
  ];

  const cardStyle = { borderColor: "var(--wgi-border)", background: "white" };
  const th = "px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap";
  const num = "rm-num px-4 py-2.5 text-right whitespace-nowrap";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {back}

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
            {client.name}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
            ID {client.client_ref}
          </p>
        </div>
        <Link
          href={`/risk-matrix/new?client=${client.id}`}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--wgi-navy)" }}
        >
          Reevaluar cliente
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          {/* ── Result ── */}
          <div className="rounded-xl border px-5 py-5" style={cardStyle}>
            <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
              Clasificación final
            </p>
            <p
              className={`font-bold leading-tight my-1 ${k === "pend" ? "text-2xl" : "text-4xl"}`}
              style={{ color: `var(--rm-${k})` }}
            >
              {r.final}
            </p>
            <p className="text-sm mb-5" style={{ color: "var(--wgi-text)" }}>
              {r.regla}
            </p>

            <ScoreScale score={r.score} clasifScore={r.clasificacion_score} />

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm mt-4">
              {meta.map(([label, value]) => (
                <Fragment key={label}>
                  <dt style={{ color: "var(--wgi-text-muted)" }}>{label}</dt>
                  <dd className="text-right" style={{ color: "var(--wgi-text)" }}>{value}</dd>
                </Fragment>
              ))}
            </dl>

            {a.cj === ELEVAR_A_ALTO && (
              <p className="text-sm mt-4" style={{ color: "var(--wgi-text)" }}>
                <b className="font-semibold">Justificación de Compliance:</b> {a.cjj}
              </p>
            )}
            {a.otro && (
              <p className="text-sm mt-3" style={{ color: "var(--wgi-text)" }}>
                <b className="font-semibold">Especificación de «Otro»:</b> {a.otro}
              </p>
            )}
            {r.alertas.length > 0 && (
              <div className="text-[13px] mt-4" style={{ color: "var(--wgi-text)" }}>
                <b className="font-semibold">Alertas al guardar</b>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {r.alertas.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── Breakdown ── */}
          <div className="rounded-xl border overflow-hidden" style={cardStyle}>
            <h2 className="text-base font-semibold px-5 pt-5 pb-3" style={{ color: "var(--wgi-text)" }}>
              Desglose
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      background: "var(--wgi-bg)",
                      borderTop: "1px solid var(--wgi-border)",
                      borderBottom: "1px solid var(--wgi-border)",
                      color: "var(--wgi-text-muted)",
                    }}
                  >
                    <th className={`${th} text-left`}>Factor / sub-factor</th>
                    <th className={`${th} text-left`}>Valor</th>
                    <th className={`${th} text-right`}>Puntos</th>
                    <th className={`${th} text-right`}>Peso</th>
                    <th className={`${th} text-right`}>Aporte</th>
                  </tr>
                </thead>
                <tbody style={{ color: "var(--wgi-text)" }}>
                  {CFG.factores.map((f, i) => {
                    const fs = r.factores[i]?.score ?? null;
                    return (
                      <Fragment key={f.factor}>
                        <tr style={{ background: "var(--wgi-bg)", borderBottom: "1px solid var(--wgi-border)" }}>
                          <td className="px-4 py-2.5 font-semibold" colSpan={2}>{f.factor}</td>
                          <td className={`${num} font-semibold`}>{fmtNum(fs, 1)}</td>
                          <td className={`${num} font-semibold`}>{fmtNum(f.ponderacion * 100, 0)}%</td>
                          <td className={`${num} font-semibold`}>
                            {fs == null ? "—" : fmtNum(fs * f.ponderacion)}
                          </td>
                        </tr>
                        {f.subfactores.map((s) => {
                          const p = r.puntos[s.subfactor];
                          return (
                            <tr key={s.subfactor} style={{ borderBottom: "1px solid var(--wgi-border)" }}>
                              <td className="pl-8 pr-4 py-2.5">{s.subfactor}</td>
                              <td className="px-4 py-2.5" style={{ color: "var(--wgi-text-muted)" }}>
                                {values[s.subfactor] || "—"}
                              </td>
                              <td className={num}>{p == null ? "—" : p}</td>
                              <td className={num}>{fmtNum(s.ponderacion_efectiva * 100)}%</td>
                              <td className={num}>
                                {p == null ? "—" : fmtNum(p * s.ponderacion_efectiva)}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── History ── */}
        <aside className="rounded-xl border px-5 py-5" style={cardStyle}>
          <h2 className="text-base font-semibold mb-2" style={{ color: "var(--wgi-text)" }}>
            Historial
          </h2>
          <ul>
            {evaluations.map((e) => {
              const current = e.id === ev.id;
              return (
                <li
                  key={e.id}
                  className="border-b last:border-b-0"
                  style={{ borderColor: "var(--wgi-border)" }}
                >
                  <button
                    type="button"
                    aria-current={current}
                    onClick={() => setSelectedId(e.id)}
                    className="w-full flex items-center gap-3 py-2.5 text-left transition-opacity hover:opacity-70"
                  >
                    <span className="mr-auto text-sm" style={{ color: "var(--wgi-text)" }}>
                      <span className={current ? "font-semibold" : ""}>{fmtDate(e.evaluation_date)}</span>
                      <br />
                      <span className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                        {e.evaluation_type}
                      </span>
                    </span>
                    <RiskPill value={e.result.final} />
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
