"use client";

import { useState } from "react";
import {
  type FFField,
  type FFFieldOption,
  type FFSubField,
  type FFLanguage,
  type AnswerValue,
  type RiskProfile,
  getHelpText,
  getLabel,
  getPlaceholder,
} from "@/lib/financial-planner/fact-find-types";

const CURRENCIES = ["USD", "GBP", "EUR", "AED", "SGD", "PAB"] as const;

const RISK_PROFILE_LABELS: Record<RiskProfile, { en: string; es: string; color: string }> = {
  conservative: { en: "Conservative", es: "Conservador", color: "#2563eb" },
  balanced: { en: "Balanced", es: "Equilibrado", color: "#16a34a" },
  growth: { en: "Growth", es: "Crecimiento", color: "#d97706" },
  aggressive: { en: "Aggressive", es: "Agresivo", color: "#dc2626" },
};

interface FieldRendererProps {
  field: FFField;
  language: FFLanguage;
  value: AnswerValue;
  onChange: (fieldKey: string, value: AnswerValue) => void;
  readOnly?: boolean;
}

export default function FieldRenderer({
  field,
  language,
  value,
  onChange,
  readOnly = false,
}: FieldRendererProps) {
  const label = getLabel(field, language);
  const placeholder = getPlaceholder(field, language);
  const helpText = getHelpText(field, language);
  const required = field.is_required;

  const inputBase =
    "w-full px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:opacity-60 disabled:cursor-not-allowed";
  const inputStyle = {
    borderColor: "var(--wgi-border)",
    color: "var(--wgi-text)",
    background: readOnly ? "var(--wgi-bg)" : "white",
  };

  function renderField() {
    switch (field.field_type) {
      case "text":
        return (
          <input
            type="text"
            className={inputBase}
            style={inputStyle}
            value={(value as string) ?? ""}
            placeholder={placeholder}
            required={required}
            disabled={readOnly}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        );

      case "textarea":
        return (
          <textarea
            className={`${inputBase} min-h-[80px] resize-y`}
            style={inputStyle}
            value={(value as string) ?? ""}
            placeholder={placeholder}
            required={required}
            disabled={readOnly}
            rows={3}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        );

      case "number":
        return (
          <input
            type="number"
            className={inputBase}
            style={inputStyle}
            value={(value as number) ?? ""}
            placeholder={placeholder ?? "0"}
            required={required}
            disabled={readOnly}
            step="any"
            onChange={(e) =>
              onChange(field.key, e.target.value === "" ? null : parseFloat(e.target.value))
            }
          />
        );

      case "date":
        return (
          <input
            type="date"
            className={inputBase}
            style={inputStyle}
            value={(value as string) ?? ""}
            required={required}
            disabled={readOnly}
            onChange={(e) => onChange(field.key, e.target.value || null)}
          />
        );

      case "currency":
        return (
          <CurrencyField
            value={value as { amount?: number; currency?: string } | null}
            onChange={(v) => onChange(field.key, v)}
            required={required}
            readOnly={readOnly}
            inputBase={inputBase}
            inputStyle={inputStyle}
          />
        );

      case "select": {
        const opts = (field.options as FFFieldOption[]) ?? [];
        return (
          <select
            className={inputBase}
            style={inputStyle}
            value={(value as string) ?? ""}
            required={required}
            disabled={readOnly}
            onChange={(e) => onChange(field.key, e.target.value || null)}
          >
            <option value="">
              {language === "es" ? "— Seleccione —" : "— Select —"}
            </option>
            {opts.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {language === "es" ? opt.label_es : opt.label_en}
              </option>
            ))}
          </select>
        );
      }

      case "multiselect": {
        const opts = (field.options as FFFieldOption[]) ?? [];
        const selected = (value as string[]) ?? [];
        return (
          <div className="flex flex-col gap-2">
            {opts.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-[var(--wgi-navy)]"
                  checked={selected.includes(opt.value)}
                  disabled={readOnly}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, opt.value]
                      : selected.filter((v) => v !== opt.value);
                    onChange(field.key, next);
                  }}
                />
                <span style={{ color: "var(--wgi-text)" }}>
                  {language === "es" ? opt.label_es : opt.label_en}
                </span>
              </label>
            ))}
          </div>
        );
      }

      case "boolean":
        return (
          <div className="flex gap-3">
            {[
              { val: true, labelEn: "Yes", labelEs: "Sí" },
              { val: false, labelEn: "No", labelEs: "No" },
            ].map(({ val, labelEn, labelEs }) => (
              <button
                key={String(val)}
                type="button"
                disabled={readOnly}
                onClick={() => !readOnly && onChange(field.key, val)}
                className="px-5 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-60"
                style={
                  value === val
                    ? { background: "var(--wgi-navy)", color: "white", borderColor: "var(--wgi-navy)" }
                    : { background: "white", color: "var(--wgi-text)", borderColor: "var(--wgi-border)" }
                }
              >
                {language === "es" ? labelEs : labelEn}
              </button>
            ))}
          </div>
        );

      case "computed":
        return (
          <ComputedRiskProfile
            value={value as string | null}
            language={language}
            options={field.options as Record<string, { label_en: string; label_es: string }> | null}
          />
        );

      case "repeating_group":
        return (
          <RepeatingGroupField
            subFields={(field.options as FFSubField[]) ?? []}
            value={(value as Record<string, unknown>[]) ?? []}
            onChange={(v) => onChange(field.key, v)}
            language={language}
            readOnly={readOnly}
            inputBase={inputBase}
            inputStyle={inputStyle}
          />
        );

      default:
        return (
          <input
            type="text"
            className={inputBase}
            style={inputStyle}
            value={(value as string) ?? ""}
            disabled={readOnly}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        );
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" style={{ color: "var(--wgi-text)" }}>
        {label}
        {required && (
          <span className="ml-1" style={{ color: "#ef4444" }}>
            *
          </span>
        )}
      </label>

      {renderField()}

      {helpText && (
        <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
          {helpText}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Currency field
// ---------------------------------------------------------------------------
function CurrencyField({
  value,
  onChange,
  required,
  readOnly,
  inputBase,
  inputStyle,
}: {
  value: { amount?: number; currency?: string } | null;
  onChange: (v: { amount?: number; currency?: string }) => void;
  required: boolean;
  readOnly: boolean;
  inputBase: string;
  inputStyle: React.CSSProperties;
}) {
  const amount = value?.amount ?? "";
  const currency = value?.currency ?? "USD";

  return (
    <div className="flex gap-2">
      <input
        type="number"
        className={`${inputBase} flex-1`}
        style={inputStyle}
        value={amount}
        placeholder="0.00"
        required={required}
        disabled={readOnly}
        step="0.01"
        min="0"
        onChange={(e) =>
          onChange({
            amount: e.target.value === "" ? undefined : parseFloat(e.target.value),
            currency,
          })
        }
      />
      <select
        className={`${inputBase} w-24`}
        style={inputStyle}
        value={currency}
        disabled={readOnly}
        onChange={(e) => onChange({ amount: value?.amount, currency: e.target.value })}
      >
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Computed risk profile display
// ---------------------------------------------------------------------------
function ComputedRiskProfile({
  value,
  language,
  options,
}: {
  value: string | null;
  language: FFLanguage;
  options: Record<string, { label_en: string; label_es: string }> | null;
}) {
  if (!value) {
    return (
      <div
        className="px-4 py-3 rounded-lg border text-sm"
        style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text-muted)", background: "var(--wgi-bg)" }}
      >
        {language === "es"
          ? "Se calculará automáticamente al completar las 7 preguntas."
          : "Will be calculated automatically once all 7 questions are answered."}
      </div>
    );
  }

  const profileKey = value as RiskProfile;
  const profileInfo = RISK_PROFILE_LABELS[profileKey];
  const label =
    options?.[profileKey]
      ? language === "es"
        ? options[profileKey].label_es
        : options[profileKey].label_en
      : profileInfo
        ? language === "es"
          ? profileInfo.es
          : profileInfo.en
        : value;

  return (
    <div
      className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border"
      style={{ borderColor: profileInfo?.color ?? "var(--wgi-border)", background: "var(--wgi-bg)" }}
    >
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: profileInfo?.color ?? "var(--wgi-navy)" }}
      />
      <span className="text-sm font-semibold" style={{ color: profileInfo?.color ?? "var(--wgi-text)" }}>
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Repeating group field
// ---------------------------------------------------------------------------
function RepeatingGroupField({
  subFields,
  value,
  onChange,
  language,
  readOnly,
  inputBase,
  inputStyle,
}: {
  subFields: FFSubField[];
  value: Record<string, unknown>[];
  onChange: (v: Record<string, unknown>[]) => void;
  language: FFLanguage;
  readOnly: boolean;
  inputBase: string;
  inputStyle: React.CSSProperties;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    value.length === 0 ? null : 0
  );

  function addRow() {
    const newRow: Record<string, unknown> = {};
    subFields.forEach((sf) => {
      newRow[sf.key] = sf.type === "boolean" ? null : sf.type === "multiselect" ? [] : "";
    });
    const next = [...value, newRow];
    onChange(next);
    setExpandedIndex(next.length - 1);
  }

  function removeRow(index: number) {
    const next = value.filter((_, i) => i !== index);
    onChange(next);
    setExpandedIndex(next.length > 0 ? Math.min(index, next.length - 1) : null);
  }

  function updateRow(index: number, key: string, val: unknown) {
    const next = value.map((row, i) =>
      i === index ? { ...row, [key]: val } : row
    );
    onChange(next);
  }

  if (readOnly && value.length === 0) {
    return (
      <p className="text-sm italic" style={{ color: "var(--wgi-text-muted)" }}>
        {language === "es" ? "Sin entradas." : "No entries."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((row, index) => {
        const isExpanded = expandedIndex === index;
        const rowLabel = row[subFields[0]?.key] as string | undefined;

        return (
          <div
            key={index}
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: "var(--wgi-border)" }}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none"
              style={{ background: "var(--wgi-bg)" }}
              onClick={() => setExpandedIndex(isExpanded ? null : index)}
            >
              <span className="text-sm font-medium" style={{ color: "var(--wgi-text)" }}>
                {rowLabel
                  ? `${index + 1}. ${rowLabel}`
                  : `${language === "es" ? "Entrada" : "Entry"} ${index + 1}`}
              </span>
              <div className="flex items-center gap-2">
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRow(index);
                    }}
                    className="text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity"
                    style={{ color: "#ef4444" }}
                  >
                    {language === "es" ? "Eliminar" : "Remove"}
                  </button>
                )}
                <span style={{ color: "var(--wgi-text-muted)" }}>{isExpanded ? "▲" : "▼"}</span>
              </div>
            </div>

            {isExpanded && (
              <div
                className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t"
                style={{ borderColor: "var(--wgi-border)" }}
              >
                {subFields.map((sf) => (
                  <SubFieldRenderer
                    key={sf.key}
                    subField={sf}
                    value={row[sf.key] ?? ""}
                    language={language}
                    readOnly={readOnly}
                    inputBase={inputBase}
                    inputStyle={inputStyle}
                    onChange={(v) => updateRow(index, sf.key, v)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:opacity-80"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-navy)", background: "var(--wgi-bg)" }}
        >
          <span>＋</span>
          {language === "es" ? "Agregar entrada" : "Add entry"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-field renderer for repeating groups
// ---------------------------------------------------------------------------
function SubFieldRenderer({
  subField,
  value,
  language,
  readOnly,
  inputBase,
  inputStyle,
  onChange,
}: {
  subField: FFSubField;
  value: unknown;
  language: FFLanguage;
  readOnly: boolean;
  inputBase: string;
  inputStyle: React.CSSProperties;
  onChange: (v: unknown) => void;
}) {
  const label = language === "es" ? subField.label_es : subField.label_en;

  function renderInput() {
    switch (subField.type) {
      case "select": {
        const opts = (subField.options as FFFieldOption[]) ?? [];
        return (
          <select
            className={inputBase}
            style={inputStyle}
            value={(value as string) ?? ""}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">— {language === "es" ? "Seleccione" : "Select"} —</option>
            {opts.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {language === "es" ? opt.label_es : opt.label_en}
              </option>
            ))}
          </select>
        );
      }
      case "date":
        return (
          <input
            type="date"
            className={inputBase}
            style={inputStyle}
            value={(value as string) ?? ""}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value || null)}
          />
        );
      case "number":
        return (
          <input
            type="number"
            className={inputBase}
            style={inputStyle}
            value={(value as number) ?? ""}
            disabled={readOnly}
            step="any"
            onChange={(e) =>
              onChange(e.target.value === "" ? null : parseFloat(e.target.value))
            }
          />
        );
      default:
        return (
          <input
            type="text"
            className={inputBase}
            style={inputStyle}
            value={(value as string) ?? ""}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: "var(--wgi-text-muted)" }}>
        {label}
        {subField.required && (
          <span className="ml-1" style={{ color: "#ef4444" }}>
            *
          </span>
        )}
      </label>
      {renderInput()}
    </div>
  );
}
