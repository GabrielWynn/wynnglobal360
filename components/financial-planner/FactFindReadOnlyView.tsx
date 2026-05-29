"use client";

import { useState } from "react";
import type {
  FFAnswer,
  FFFactFind,
  FFField,
  FFSection,
  FFLanguage,
} from "@/lib/financial-planner/fact-find-types";
import {
  getLabel,
  formatDateDisplay,
} from "@/lib/financial-planner/fact-find-types";
import FieldRenderer from "./FieldRenderer";

interface FactFindReadOnlyViewProps {
  factFind: FFFactFind;
  sections: (FFSection & { fields: FFField[] })[];
  answers: FFAnswer[];
  language: FFLanguage;
}

const RISK_COLORS: Record<string, string> = {
  conservative: "#2563eb",
  balanced: "#16a34a",
  growth: "#d97706",
  aggressive: "#dc2626",
};

export default function FactFindReadOnlyView({
  factFind,
  sections,
  answers,
  language,
}: FactFindReadOnlyViewProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(
    sections[0]?.id ?? null
  );

  const answerMap: Record<string, FFAnswer> = {};
  for (const a of answers) {
    answerMap[a.field_key] = a;
  }

  function getAnswerValue(fieldKey: string, fieldType: string): unknown {
    const a = answerMap[fieldKey];
    if (!a) return null;
    switch (fieldType) {
      case "number": return a.value_number;
      case "date": return a.value_date;
      case "boolean": return a.value_boolean;
      case "currency":
      case "multiselect":
      case "repeating_group":
      case "computed": return a.value_json ?? a.value_text;
      default: return a.value_text;
    }
  }

  const completedKeys = Array.isArray(factFind.completed_section_keys)
    ? factFind.completed_section_keys
    : [];

  return (
    <div className="flex flex-col gap-4">
      {/* Header meta */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl border"
        style={{ borderColor: "var(--wgi-border)", background: "var(--wgi-bg)" }}
      >
        {[
          { label: "Status", value: factFind.status.replace("_", " ") },
          { label: "Language", value: factFind.language === "es" ? "Español" : "English" },
          { label: "Progress", value: `${completedKeys.length}/${sections.length} sections` },
          {
            label: "Submitted",
            value: factFind.submitted_at
              ? formatDateDisplay(factFind.submitted_at)
              : "Not submitted",
          },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--wgi-text-muted)" }}>
              {label}
            </p>
            <p className="text-sm font-semibold capitalize" style={{ color: "var(--wgi-text)" }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Risk profile banner if available */}
      {answerMap["rt_profile_result"]?.value_text && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl border"
          style={{
            borderColor: RISK_COLORS[answerMap["rt_profile_result"].value_text] ?? "var(--wgi-border)",
            background: "var(--wgi-bg)",
          }}
        >
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: RISK_COLORS[answerMap["rt_profile_result"].value_text] ?? "var(--wgi-navy)" }}
          />
          <span className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
            Risk Profile:{" "}
            <span
              style={{ color: RISK_COLORS[answerMap["rt_profile_result"].value_text] ?? "var(--wgi-text)" }}
            >
              {answerMap["rt_profile_result"].value_text.charAt(0).toUpperCase() +
                answerMap["rt_profile_result"].value_text.slice(1)}
            </span>
          </span>
        </div>
      )}

      {/* Sections */}
      {sections.map((section) => {
        const isExpanded = expandedSection === section.id;
        const isCompleted = completedKeys.includes(section.key);

        return (
          <div
            key={section.id}
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--wgi-border)" }}
          >
            <button
              type="button"
              className="w-full flex items-center justify-between px-5 py-3.5 text-left"
              style={{ background: isExpanded ? "var(--wgi-navy)" : "var(--wgi-bg)" }}
              onClick={() => setExpandedSection(isExpanded ? null : section.id)}
            >
              <div className="flex items-center gap-3">
                {isCompleted ? (
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: isExpanded ? "white" : "var(--wgi-gold)", color: isExpanded ? "var(--wgi-gold)" : "white" }}
                  >
                    ✓
                  </span>
                ) : (
                  <span
                    className="w-5 h-5 rounded-full border-2 flex-shrink-0"
                    style={{ borderColor: isExpanded ? "rgba(255,255,255,0.4)" : "var(--wgi-border)" }}
                  />
                )}
                <span
                  className="text-sm font-semibold"
                  style={{ color: isExpanded ? "white" : "var(--wgi-text)" }}
                >
                  {getLabel(section, language)}
                </span>
              </div>
              <span style={{ color: isExpanded ? "rgba(255,255,255,0.7)" : "var(--wgi-text-muted)" }}>
                {isExpanded ? "▲" : "▼"}
              </span>
            </button>

            {isExpanded && (
              <div
                className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-5 border-t"
                style={{ borderColor: "var(--wgi-border)" }}
              >
                {section.fields.map((field) => (
                  <div
                    key={field.id}
                    className={
                      field.field_type === "textarea" || field.field_type === "repeating_group"
                        ? "md:col-span-2"
                        : ""
                    }
                  >
                    <FieldRenderer
                      field={field}
                      language={language}
                      value={getAnswerValue(field.key, field.field_type) as never}
                      onChange={() => {}}
                      readOnly
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
