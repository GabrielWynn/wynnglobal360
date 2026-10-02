"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LacrmLookup, { type LacrmPick } from "@/components/risk-matrix/LacrmLookup";
import ScoreScale from "@/components/risk-matrix/ScoreScale";
import { levelKey } from "@/components/risk-matrix/RiskPill";
import { getAuthHeaders } from "@/lib/supabase";
import { CFG } from "@/lib/risk-matrix/config";
import {
  ALERTA_DATOS,
  FX,
  UNICO,
  evaluate,
  type AnswerKey,
  type Answers,
} from "@/lib/risk-matrix/engine";
import { SECTIONS, blockingFields, type FieldDef } from "@/lib/risk-matrix/form";
import { fmtDate, fmtNum, todayISO } from "@/lib/risk-matrix/format";

const FACTOR_WEIGHT: Record<string, number> = {};
CFG.factores.forEach((f) => (FACTOR_WEIGHT[f.factor] = f.ponderacion));

interface EvaluationFormProps {
  /** Answers carried over from the client's previous evaluation. */
  prefill?: Answers;
  reeval?: boolean;
  /** LACRM contact to start from (e.g. /risk-matrix/new?lacrm=…). */
  lacrm?: LacrmPick;
  /** Shown above the form, e.g. when LACRM could not be reached. */
  notice?: string;
}

export default function EvaluationForm({
  prefill,
  reeval = false,
  lacrm: initialLacrm,
  notice,
}: EvaluationFormProps) {
  const router = useRouter();
  const resultRef = useRef<HTMLElement>(null);

  const [answers, setAnswers] = useState<Answers>({
    tipo_eval: "Onboarding",
    moneda: "USD",
    cj: "Sin observación",
    ...prefill,
    ...initialLacrm?.prefill,
  });
  const [lacrm, setLacrm] = useState<LacrmPick | null>(initialLacrm ?? null);
  const [touchedSave, setTouchedSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Evaluation date defaults to today in the browser's timezone
  useEffect(() => {
    setAnswers((prev) => (prev.fe ? prev : { ...prev, fe: todayISO() }));
  }, []);

  function set(key: AnswerKey, value: string) {
    setAnswers((prev) => {
      const next = { ...prev, [key]: value };
      // A single-contribution plan has no frequency of its own
      if (next.tipo === UNICO) next.freq = "";
      return next;
    });
    setError(null);
  }

  function applyLacrm(pick: LacrmPick) {
    setLacrm(pick);
    setAnswers((prev) => ({ ...prev, ...pick.prefill }));
    setError(null);
  }

  const x = useMemo(() => evaluate(answers), [answers]);
  const blocking = useMemo(() => blockingFields(answers, x), [answers, x]);
  const missKeys = touchedSave ? blocking.map((f) => f.k) : [];
  const k = levelKey(x.final);
  const extraAlerts = x.alertas.filter((t) => t !== ALERTA_DATOS);

  async function save() {
    if (blocking.length) {
      setTouchedSave(true);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/risk-matrix/evaluations", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ answers, lacrmContactId: lacrm?.contactId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar. Intenta de nuevo.");
        return;
      }

      router.push(`/risk-matrix/clients/${data.clientId}?eval=${data.evaluationId}`);
      router.refresh();
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------------
  // Field rendering
  // ------------------------------------------------------------------

  function hintFor(f: FieldDef): string {
    if (f.k === "monto") {
      if (x.usd == null) {
        return answers.tipo === UNICO ? "Monto total del aporte único." : "Monto por pago.";
      }
      const approx = answers.moneda !== "USD" ? `≈ USD ${fmtNum(x.usd)} · ` : "";
      return approx + (x.montoRango ?? "");
    }
    if (f.k === "fn" && x.edad != null) return `${x.edad} años (${x.edadRango})`;
    if (f.k === "freq" && answers.tipo === UNICO) return "Se asigna «Aporte Único» automáticamente.";
    return f.hint ?? "";
  }

  function renderControl(f: FieldDef, id: string) {
    const value = answers[f.k] ?? "";
    const cls = `rm-input${missKeys.includes(f.k) ? " rm-miss" : ""}`;

    if (f.type === "select") {
      return (
        <select
          id={id}
          className={cls}
          value={value}
          disabled={f.k === "freq" && answers.tipo === UNICO}
          onChange={(e) => set(f.k, e.target.value)}
        >
          <option value="">Seleccionar…</option>
          {f.opts!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    }

    if (f.type === "textarea") {
      return (
        <textarea
          id={id}
          className={`${cls} min-h-[80px] resize-y`}
          value={value}
          rows={3}
          onChange={(e) => set(f.k, e.target.value)}
        />
      );
    }

    if (f.type === "money") {
      return (
        <div className="grid grid-cols-[96px_1fr] gap-2">
          <select
            className="rm-input"
            aria-label="Moneda"
            value={answers.moneda ?? "USD"}
            onChange={(e) => set("moneda", e.target.value)}
          >
            {Object.keys(FX).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input
            id={id}
            className={`${cls} rm-num`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={value}
            onChange={(e) => set(f.k, e.target.value)}
          />
        </div>
      );
    }

    return (
      <input
        id={id}
        className={cls}
        type={f.type}
        value={value}
        autoComplete="off"
        onChange={(e) => set(f.k, e.target.value)}
      />
    );
  }

  function renderField(f: FieldDef) {
    if (f.cond && !f.cond(answers)) return null;
    const id = `rm_${f.k}`;
    const hint = hintFor(f);
    const value = answers[f.k] ?? "";
    // Value still as it came from LACRM
    const fromLacrm = !!value && lacrm?.prefill[f.k] === value;
    // LACRM has a value the catalogue does not recognise; shown until the field is filled
    const lacrmHint = !value ? lacrm?.hints[f.k] : undefined;

    return (
      <div key={f.k} className={`flex flex-col gap-1.5 min-w-0 ${f.full ? "sm:col-span-2" : ""}`}>
        <label htmlFor={id} className="text-sm font-medium" style={{ color: "var(--wgi-text)" }}>
          {f.label}
          {f.opt && (
            <span className="font-normal" style={{ color: "var(--wgi-text-muted)" }}>
              {" "}(opcional)
            </span>
          )}
          {fromLacrm && (
            <span
              className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold align-middle"
              style={{ background: "var(--wgi-bg)", color: "var(--wgi-text-muted)" }}
            >
              LACRM
            </span>
          )}
        </label>
        {renderControl(f, id)}
        {lacrmHint && (
          <p className="text-xs" style={{ color: "var(--rm-medio)" }}>
            En LACRM: «{lacrmHint}». Elige la opción equivalente.
          </p>
        )}
        {hint && (
          <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
            {hint}
          </p>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const saveNote = blocking.length
    ? `Faltan ${blocking.length} campo${blocking.length > 1 ? "s" : ""}: ${blocking
        .slice(0, 4)
        .map((f) => f.label)
        .join(", ")}${blocking.length > 4 ? "…" : ""}`
    : "Una vez guardada, la evaluación no se puede editar. Para cambios, haz una reevaluación.";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 pb-28 lg:pb-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
          {reeval ? "Reevaluación" : "Nueva evaluación"}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
          Metodología v{CFG.version} · {CFG.tipo_cliente}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        {/* ── Form sections ── */}
        <div className="flex flex-col gap-4">
          {notice && (
            <div
              className="px-4 py-3 rounded-lg text-sm"
              style={{ background: "var(--rm-medio-bg)", color: "var(--wgi-text)" }}
            >
              {notice}
            </div>
          )}

          {!reeval && <LacrmLookup onPick={applyLacrm} />}

          {lacrm && (
            <p className="text-sm px-1" style={{ color: "var(--wgi-text-muted)" }}>
              Datos cargados de LACRM:{" "}
              <b className="font-semibold" style={{ color: "var(--wgi-text)" }}>
                {lacrm.name || lacrm.prefill.id}
              </b>
              . Revisa y completa lo que falte.
            </p>
          )}

          {SECTIONS.map((s) => (
            <section
              key={s.id}
              aria-labelledby={`rm_h_${s.id}`}
              className="rounded-xl border px-5 py-5"
              style={{ borderColor: "var(--wgi-border)", background: "white" }}
            >
              <div
                className="flex items-baseline justify-between gap-3 pb-3 mb-4 border-b"
                style={{ borderColor: "var(--wgi-border)" }}
              >
                <h2
                  id={`rm_h_${s.id}`}
                  className="text-base font-semibold"
                  style={{ color: "var(--wgi-text)" }}
                >
                  {s.title}
                </h2>
                {s.factor && (
                  <span className="text-xs whitespace-nowrap" style={{ color: "var(--wgi-text-muted)" }}>
                    <b className="font-semibold" style={{ color: "var(--wgi-gold)" }}>
                      {Math.round(FACTOR_WEIGHT[s.factor] * 100)}%
                    </b>{" "}
                    del score
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {s.fields.map(renderField)}
              </div>
            </section>
          ))}
        </div>

        {/* ── Result panel ── */}
        <aside
          ref={resultRef}
          aria-live="polite"
          className="rounded-xl border overflow-hidden lg:sticky lg:top-[120px] scroll-mt-[120px]"
          style={{ borderColor: "var(--wgi-border)", background: "white" }}
        >
          <div className="px-5 py-5 border-b" style={{ borderColor: "var(--wgi-border)" }}>
            <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
              Clasificación final
            </p>
            <p
              className={`font-bold leading-tight my-1 ${k === "pend" ? "text-2xl" : "text-4xl"}`}
              style={{ color: `var(--rm-${k})` }}
            >
              {x.final}
            </p>
            <p className="text-sm" style={{ color: "var(--wgi-text)" }}>
              {x.regla}
            </p>
          </div>

          <div className="px-5 py-4 border-b" style={{ borderColor: "var(--wgi-border)" }}>
            <ScoreScale score={x.score} clasifScore={x.clasifScore} />
          </div>

          <div className="px-5 py-4 border-b flex flex-col gap-2.5" style={{ borderColor: "var(--wgi-border)" }}>
            {x.factores.map((f) => (
              <div key={f.factor} className="text-[13px]">
                <div className="flex justify-between gap-3 mb-1">
                  <span style={{ color: "var(--wgi-text)" }}>
                    {f.factor}{" "}
                    <span style={{ color: "var(--wgi-text-muted)" }}>{Math.round(f.peso * 100)}%</span>
                  </span>
                  <span className="rm-num" style={{ color: "var(--wgi-text)" }}>
                    {fmtNum(f.score, 1)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--wgi-border)" }}>
                  <div
                    className="rm-bar h-full"
                    style={{ width: `${f.score ?? 0}%`, background: "var(--wgi-navy-500)" }}
                  />
                </div>
              </div>
            ))}
          </div>

          <dl
            className="px-5 py-4 border-b grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm"
            style={{ borderColor: "var(--wgi-border)" }}
          >
            <dt style={{ color: "var(--wgi-text-muted)" }}>Debida diligencia</dt>
            <dd className="text-right" style={{ color: "var(--wgi-text)" }}>{x.dd ?? "—"}</dd>
            <dt style={{ color: "var(--wgi-text-muted)" }}>Próxima revisión</dt>
            <dd className="text-right" style={{ color: "var(--wgi-text)" }}>{fmtDate(x.proxima)}</dd>
          </dl>

          {extraAlerts.length > 0 && (
            <div
              className="px-5 py-3 border-b text-[13px]"
              style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
            >
              <b className="font-semibold">Revisar</b>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                {extraAlerts.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="px-5 py-4 flex flex-col gap-2">
            {error && (
              <div
                className="px-4 py-3 rounded-lg text-sm"
                style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}
              >
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--wgi-navy)" }}
            >
              {saving ? "Guardando…" : "Guardar evaluación"}
            </button>
            <p
              className="text-xs"
              style={{ color: touchedSave && blocking.length ? "var(--rm-alto)" : "var(--wgi-text-muted)" }}
            >
              {saveNote}
            </p>
          </div>
        </aside>
      </div>

      {/* ── Mobile summary bar: the result panel sits below the form on small screens ── */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-20 flex items-center gap-3 px-4 py-2.5 border-t"
        style={{
          background: "white",
          borderColor: "var(--wgi-border)",
          boxShadow: "0 -4px 18px rgba(15,35,64,0.08)",
        }}
      >
        <span className="text-lg font-bold mr-auto" style={{ color: `var(--rm-${k})` }}>
          {x.final}
        </span>
        {x.score != null && (
          <span className="rm-num text-sm" style={{ color: "var(--wgi-text-muted)" }}>
            Score {fmtNum(x.score, 1)}
          </span>
        )}
        <button
          type="button"
          onClick={() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
        >
          Ver resultado
        </button>
      </div>
    </div>
  );
}
