"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient, getAuthHeaders } from "@/lib/supabase";
import {
  type FFAnswer,
  type FFFactFind,
  type FFField,
  type FFSection,
  type FFLanguage,
  type AnswerValue,
  type UpsertAnswerPayload,
  computeRiskProfile,
  getLabel,
} from "@/lib/financial-planner/fact-find-types";
import FieldRenderer from "./FieldRenderer";
import WizardSidebar from "./WizardSidebar";

interface FactFindWizardProps {
  factFind: FFFactFind;
  sections: (FFSection & { fields: FFField[] })[];
  initialAnswers: FFAnswer[];
}

export default function FactFindWizard({
  factFind,
  sections,
  initialAnswers,
}: FactFindWizardProps) {
  const router = useRouter();
  const language: FFLanguage = factFind.language;

  const [currentIndex, setCurrentIndex] = useState(factFind.current_section_index);
  const [completedKeys, setCompletedKeys] = useState<string[]>(
    Array.isArray(factFind.completed_section_keys) ? factFind.completed_section_keys : []
  );

  // Flat answer map: { field_key: value }
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => {
    const map: Record<string, AnswerValue> = {};
    for (const a of initialAnswers) {
      if (a.value_json !== null && a.value_json !== undefined) {
        map[a.field_key] = a.value_json as AnswerValue;
      } else if (a.value_text !== null) {
        map[a.field_key] = a.value_text;
      } else if (a.value_number !== null) {
        map[a.field_key] = a.value_number;
      } else if (a.value_date !== null) {
        map[a.field_key] = a.value_date;
      } else if (a.value_boolean !== null) {
        map[a.field_key] = a.value_boolean;
      }
    }
    return map;
  });

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isCompleted = factFind.status === "completed";
  const [submitted, setSubmitted] = useState(isCompleted);
  const [reviewing, setReviewing] = useState(false);

  const currentSection = sections[currentIndex];
  const isLastSection = currentIndex === sections.length - 1;

  // Auto-compute risk profile when in risk_tolerance section
  useEffect(() => {
    if (currentSection?.key !== "risk_tolerance") return;
    const riskAnswers: Record<string, string> = {};
    for (let i = 1; i <= 7; i++) {
      const v = answers[`rt_q${i}`];
      if (typeof v === "string") riskAnswers[`rt_q${i}`] = v;
    }
    const profile = computeRiskProfile(riskAnswers);
    if (profile && answers["rt_profile_result"] !== profile) {
      setAnswers((prev) => ({ ...prev, rt_profile_result: profile }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, currentSection?.key]);

  function handleFieldChange(fieldKey: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [fieldKey]: value }));
    setSaveError(null);
  }

  function buildAnswerPayloads(fields: FFField[]): UpsertAnswerPayload[] {
    return fields.map((field) => {
      const val = answers[field.key];
      const payload: UpsertAnswerPayload = { field_key: field.key };

      switch (field.field_type) {
        case "number":
          payload.value_number = (val as number) ?? null;
          break;
        case "date":
          payload.value_date = (val as string) ?? null;
          break;
        case "boolean":
          payload.value_boolean = (val as boolean) ?? null;
          break;
        case "currency":
        case "multiselect":
        case "repeating_group":
          payload.value_json = val ?? null;
          break;
        default:
          payload.value_text = (val as string) ?? null;
      }

      return payload;
    });
  }

  async function saveSection(sectionKey: string, fields: FFField[]): Promise<boolean> {
    setSaving(true);
    setSaveError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/financial-planner/fact-finds/${factFind.id}/answers`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          section_key: sectionKey,
          answers: buildAnswerPayloads(fields),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error ?? "Failed to save");
        return false;
      }

      if (!completedKeys.includes(sectionKey)) {
        setCompletedKeys((prev) => [...prev, sectionKey]);
      }
      return true;
    } catch {
      setSaveError("Network error. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    if (!currentSection) return;
    const ok = await saveSection(currentSection.key, currentSection.fields);
    if (!ok) return;
    const nextIndex = Math.min(currentIndex + 1, sections.length - 1);
    setCurrentIndex(nextIndex);
  }

  async function handleBack() {
    if (currentIndex === 0) return;
    // Auto-save current section before going back
    if (currentSection) {
      await saveSection(currentSection.key, currentSection.fields);
    }
    setCurrentIndex((prev) => prev - 1);
  }

  async function handleNavigate(index: number) {
    if (index === currentIndex) return;
    if (currentSection) {
      await saveSection(currentSection.key, currentSection.fields);
    }
    setCurrentIndex(index);
  }

  async function handleSubmit() {
    if (!currentSection) return;
    const ok = await saveSection(currentSection.key, currentSection.fields);
    if (!ok) return;

    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/financial-planner/fact-finds/${factFind.id}/submit`, {
        method: "POST",
        headers,
      });

      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error ?? "Failed to submit");
        return;
      }

      setSubmitted(true);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted && !reviewing) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
          style={{ background: "var(--wgi-gold)" }}
        >
          ✓
        </div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--wgi-text)" }}>
          {language === "es" ? "Fact Find Completado" : "Fact Find Completed"}
        </h2>
        <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
          {language === "es"
            ? "La información ha sido guardada exitosamente."
            : "The information has been saved successfully."}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setReviewing(true)}
            className="px-6 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
            style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
          >
            {language === "es" ? "Revisar y Editar" : "Review & Edit"}
          </button>
          <button
            onClick={() => router.push(`/financial-planner/clients/${factFind.client_id}`)}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--wgi-navy)" }}
          >
            {language === "es" ? "Volver al Cliente" : "Back to Client"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Review mode banner */}
      {isCompleted && (
        <div
          className="flex items-center justify-between px-6 py-2 text-xs font-medium flex-shrink-0"
          style={{ background: "#d1fae5", color: "#065f46", borderBottom: "1px solid #a7f3d0" }}
        >
          <span>
            {language === "es"
              ? "Revisando Fact Find completado — los cambios se guardan automáticamente al navegar"
              : "Reviewing completed Fact Find — changes are saved automatically as you navigate"}
          </span>
          <button
            onClick={() => router.push(`/financial-planner/clients/${factFind.client_id}`)}
            className="underline hover:no-underline"
          >
            {language === "es" ? "Volver al Cliente" : "Back to Client"}
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
      {/* Sidebar */}
      <WizardSidebar
        sections={sections}
        currentIndex={currentIndex}
        completedKeys={completedKeys}
        language={language}
        onNavigate={handleNavigate}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {currentSection && (
          <>
            {/* Section header */}
            <div
              className="px-8 py-5 border-b flex-shrink-0"
              style={{ borderColor: "var(--wgi-border)", background: "white" }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--wgi-text-muted)" }}>
                {language === "es" ? `Sección ${currentIndex + 1} de ${sections.length}` : `Section ${currentIndex + 1} of ${sections.length}`}
              </p>
              <h2 className="text-lg font-semibold" style={{ color: "var(--wgi-text)" }}>
                {getLabel(currentSection, language)}
              </h2>
            </div>

            {/* Fields */}
            <div className="flex-1 px-8 py-6 grid grid-cols-1 md:grid-cols-2 gap-6 content-start">
              {currentSection.fields
                .filter((f) => f.field_type !== "computed" || f.key === "rt_profile_result")
                .map((field) => (
                  <div
                    key={field.id}
                    className={
                      field.field_type === "textarea" ||
                      field.field_type === "repeating_group"
                        ? "md:col-span-2"
                        : ""
                    }
                  >
                    <FieldRenderer
                      field={field}
                      language={language}
                      value={answers[field.key] ?? null}
                      onChange={handleFieldChange}
                      readOnly={false}
                    />
                  </div>
                ))}
            </div>

            {/* Error banner */}
            {saveError && (
              <div
                className="mx-8 mb-4 px-4 py-3 rounded-lg text-sm"
                style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}
              >
                {saveError}
              </div>
            )}

            {/* Navigation footer */}
            <div
              className="flex items-center justify-between px-8 py-4 border-t flex-shrink-0"
              style={{ borderColor: "var(--wgi-border)", background: "white" }}
            >
              <button
                type="button"
                onClick={handleBack}
                disabled={currentIndex === 0 || saving}
                className="px-5 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40"
                style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
              >
                {language === "es" ? "← Anterior" : "← Previous"}
              </button>

              <div className="flex items-center gap-2">
                {saving && (
                  <span className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                    {language === "es" ? "Guardando…" : "Saving…"}
                  </span>
                )}

                {isLastSection ? (
                  isCompleted ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!currentSection) return;
                        await saveSection(currentSection.key, currentSection.fields);
                      }}
                      disabled={saving}
                      className="px-6 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: "var(--wgi-navy)" }}
                    >
                      {saving
                        ? language === "es" ? "Guardando…" : "Saving…"
                        : language === "es" ? "Guardar Cambios" : "Save Changes"}
                    </button>
                  ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving || submitting}
                    className="px-6 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: "var(--wgi-gold)" }}
                  >
                    {submitting
                      ? language === "es" ? "Enviando…" : "Submitting…"
                      : language === "es" ? "Enviar Fact Find" : "Submit Fact Find"}
                  </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={saving}
                    className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: "var(--wgi-navy)" }}
                  >
                    {saving
                      ? language === "es" ? "Guardando…" : "Saving…"
                      : language === "es" ? "Siguiente →" : "Next →"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
