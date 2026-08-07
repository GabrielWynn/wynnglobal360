"use client";

import { useState } from "react";
import { getAuthHeaders } from "@/lib/supabase";
import type {
  AnswerValue,
  FFField,
  FFFieldOption,
  FFFieldType,
  FFLanguage,
  FFSection,
  FFSubField,
} from "@/lib/financial-planner/fact-find-types";
import FieldRenderer from "./FieldRenderer";
import SaveToast from "./SaveToast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface FormVersionEditorProps {
  versionId: string;
  versionName: string;
  initialSections: (FFSection & { fields: FFField[] })[];
}

const FIELD_TYPE_OPTIONS: { value: FFFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "currency", label: "Currency" },
  { value: "select", label: "Select (dropdown)" },
  { value: "multiselect", label: "Multi-select (checkboxes)" },
  { value: "boolean", label: "Boolean (yes/no)" },
  { value: "repeating_group", label: "Repeating Group" },
  { value: "computed", label: "Computed (read-only)" },
];

const FIELD_TYPE_STYLES: Record<FFFieldType, { bg: string; color: string }> = {
  text: { bg: "#eef2ff", color: "#4338ca" },
  textarea: { bg: "#eef2ff", color: "#4338ca" },
  number: { bg: "#ecfdf5", color: "#047857" },
  date: { bg: "#ecfdf5", color: "#047857" },
  currency: { bg: "#fffbeb", color: "#b45309" },
  select: { bg: "#eff6ff", color: "#1d4ed8" },
  multiselect: { bg: "#eff6ff", color: "#1d4ed8" },
  boolean: { bg: "#fdf4ff", color: "#a21caf" },
  repeating_group: { bg: "#fef2f2", color: "#b91c1c" },
  computed: { bg: "#f3f4f6", color: "#374151" },
};

const SUB_FIELD_TYPES = ["text", "number", "date", "select"] as const;

function defaultOptionsForType(type: FFFieldType): FFField["options"] {
  if (type === "select" || type === "multiselect" || type === "repeating_group") return [];
  return null;
}

export default function FormVersionEditor({
  versionId,
  initialSections,
}: FormVersionEditorProps) {
  const [sections, setSections] = useState<(FFSection & { fields: FFField[] })[]>(
    initialSections
  );
  const [expandedSection, setExpandedSection] = useState<string | null>(
    initialSections[0]?.id ?? null
  );
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<Partial<FFField> | null>(null);
  const [editingSection, setEditingSection] = useState<Partial<FFSection> | null>(null);
  const [addingFieldToSection, setAddingFieldToSection] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<string | null>(null);
  const [confirmDeleteField, setConfirmDeleteField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function apiCall(url: string, method: string, body?: unknown): Promise<Response> {
    const headers = await getAuthHeaders();
    return fetch(url, {
      method,
      headers: { ...headers, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // ── Section operations ───────────────────────────────────────────────────

  async function createSection() {
    if (!editingSection?.key?.trim() || !editingSection?.label_en?.trim() || !editingSection?.label_es?.trim()) {
      setError("Section key, English label, and Spanish label are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiCall(`/api/financial-planner/form-versions/${versionId}/sections`, "POST", {
        key: editingSection.key.trim(),
        label_en: editingSection.label_en.trim(),
        label_es: editingSection.label_es.trim(),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSections((prev) => [...prev, { ...data.section, fields: [] }]);
      setEditingSection(null);
      setAddingSection(false);
      setToast("Section added");
    } finally {
      setSaving(false);
    }
  }

  async function moveSection(activeId: string, overId: string) {
    const oldIndex = sections.findIndex((s) => s.id === activeId);
    const newIndex = sections.findIndex((s) => s.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const direction: "up" | "down" = newIndex > oldIndex ? "down" : "up";
    const steps = Math.abs(newIndex - oldIndex);
    const previous = sections;
    setSections((prev) => arrayMove(prev, oldIndex, newIndex));

    try {
      for (let i = 0; i < steps; i++) {
        const res = await apiCall(`/api/financial-planner/sections/${activeId}/reorder`, "POST", { direction });
        if (!res.ok) throw new Error("reorder failed");
      }
      setToast("Section order updated");
    } catch {
      setSections(previous);
      setError("Failed to reorder sections. Please try again.");
    }
  }

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    moveSection(String(active.id), String(over.id));
  }

  async function updateSection(id: string, patch: Partial<FFSection>) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiCall(`/api/financial-planner/sections/${id}`, "PATCH", patch);
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...data.section } : s)));
      setEditingSectionId(null);
      setToast("Section updated");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSection(id: string) {
    setConfirmDeleteSection(null);
    const res = await apiCall(`/api/financial-planner/sections/${id}`, "DELETE");
    if (res.ok) {
      setSections((prev) => prev.filter((s) => s.id !== id));
      setExpandedSection((prev) => (prev === id ? null : prev));
      setToast("Section deleted");
    } else {
      setError("Failed to delete section. Please try again.");
    }
  }

  // ── Field operations ─────────────────────────────────────────────────────

  async function createField(sectionId: string) {
    if (!editingField?.key?.trim() || !editingField?.label_en?.trim() || !editingField?.label_es?.trim() || !editingField?.field_type) {
      setError("Field key, labels, and type are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiCall(`/api/financial-planner/sections/${sectionId}/fields`, "POST", {
        key: editingField.key.trim(),
        label_en: editingField.label_en.trim(),
        label_es: editingField.label_es.trim(),
        field_type: editingField.field_type,
        is_required: editingField.is_required ?? false,
        options: editingField.options ?? undefined,
        placeholder_en: editingField.placeholder_en || undefined,
        placeholder_es: editingField.placeholder_es || undefined,
        help_text_en: editingField.help_text_en || undefined,
        help_text_es: editingField.help_text_es || undefined,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId ? { ...s, fields: [...s.fields, data.field] } : s
        )
      );
      setEditingField(null);
      setAddingFieldToSection(null);
      setToast("Field added");
    } finally {
      setSaving(false);
    }
  }

  async function updateField(fieldId: string, sectionId: string, patch: Partial<FFField>) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiCall(`/api/financial-planner/fields/${fieldId}`, "PATCH", patch);
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, fields: s.fields.map((f) => (f.id === fieldId ? data.field : f)) }
            : s
        )
      );
      setExpandedField(null);
      setToast("Field updated");
    } finally {
      setSaving(false);
    }
  }

  async function deleteField(fieldId: string, sectionId: string) {
    setConfirmDeleteField(null);
    const res = await apiCall(`/api/financial-planner/fields/${fieldId}`, "DELETE");
    if (res.ok) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) }
            : s
        )
      );
      setToast("Field deleted");
    } else {
      setError("Failed to delete field. Please try again.");
    }
  }

  async function moveField(sectionId: string, activeId: string, overId: string) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const oldIndex = section.fields.findIndex((f) => f.id === activeId);
    const newIndex = section.fields.findIndex((f) => f.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const direction: "up" | "down" = newIndex > oldIndex ? "down" : "up";
    const steps = Math.abs(newIndex - oldIndex);
    const previous = sections;
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, fields: arrayMove(s.fields, oldIndex, newIndex) } : s
      )
    );

    try {
      for (let i = 0; i < steps; i++) {
        const res = await apiCall(`/api/financial-planner/fields/${activeId}/reorder`, "POST", { direction });
        if (!res.ok) throw new Error("reorder failed");
      }
      setToast("Field order updated");
    } catch {
      setSections(previous);
      setError("Failed to reorder fields. Please try again.");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const inputClass = "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none";
  const inputStyle = { borderColor: "var(--wgi-border)", color: "var(--wgi-text)", background: "white" };
  const totalFields = sections.reduce((sum, s) => sum + s.fields.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
          {sections.length} section{sections.length !== 1 ? "s" : ""} · {totalFields} field
          {totalFields !== 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={() => { setAddingSection(true); setEditingSection({}); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--wgi-navy)" }}
        >
          + Add Section
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}>
          {error}
        </div>
      )}

      {/* Add section form */}
      {addingSection && (
        <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: "var(--wgi-border)", background: "var(--wgi-bg)" }}>
          <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--wgi-text-muted)" }}>New Section</h4>
          <LabeledInput label="Key (snake_case)" value={editingSection?.key ?? ""} onChange={(e) => setEditingSection((p) => ({ ...p, key: e.target.value }))} inputClass={inputClass} inputStyle={inputStyle} placeholder="e.g. income_expenses" />
          <LabeledInput label="Label (English)" value={editingSection?.label_en ?? ""} onChange={(e) => setEditingSection((p) => ({ ...p, label_en: e.target.value }))} inputClass={inputClass} inputStyle={inputStyle} placeholder="Income & Expenses" />
          <LabeledInput label="Etiqueta (Español)" value={editingSection?.label_es ?? ""} onChange={(e) => setEditingSection((p) => ({ ...p, label_es: e.target.value }))} inputClass={inputClass} inputStyle={inputStyle} placeholder="Ingresos y Gastos" />
          <div className="flex gap-2">
            <button type="button" onClick={createSection} disabled={saving} className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--wgi-navy)" }}>{saving ? "Saving…" : "Add"}</button>
            <button type="button" onClick={() => { setAddingSection(false); setEditingSection(null); }} className="px-4 py-1.5 rounded-lg text-sm font-medium border" style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Sections */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {sections.map((section) => (
              <SortableSectionRow
                key={section.id}
                section={section}
                isExpanded={expandedSection === section.id}
                onToggleExpand={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                isRenaming={editingSectionId === section.id}
                onRequestRename={() => { setExpandedSection(section.id); setEditingSectionId(section.id); }}
                onSaveRename={(patch) => updateSection(section.id, patch)}
                onCancelRename={() => setEditingSectionId(null)}
                confirmingDeleteSection={confirmDeleteSection === section.id}
                onRequestDeleteSection={() => setConfirmDeleteSection(section.id)}
                onCancelDeleteSection={() => setConfirmDeleteSection(null)}
                onConfirmDeleteSection={() => deleteSection(section.id)}
                expandedField={expandedField}
                setExpandedField={setExpandedField}
                editingField={editingField}
                setEditingField={setEditingField}
                addingFieldToSection={addingFieldToSection}
                setAddingFieldToSection={setAddingFieldToSection}
                confirmDeleteField={confirmDeleteField}
                setConfirmDeleteField={setConfirmDeleteField}
                createField={createField}
                updateField={updateField}
                deleteField={deleteField}
                moveField={moveField}
                sensors={sensors}
                saving={saving}
                inputClass={inputClass}
                inputStyle={inputStyle}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {sections.length === 0 && !addingSection && (
        <div className="text-center py-12 rounded-xl border" style={{ borderColor: "var(--wgi-border)" }}>
          <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
            No sections yet. Add one to get started.
          </p>
        </div>
      )}

      <SaveToast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function LabeledInput({
  label,
  inputClass,
  inputStyle,
  ...inputProps
}: {
  label: string;
  inputClass: string;
  inputStyle: React.CSSProperties;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--wgi-text-muted)" }}>
        {label}
      </span>
      <input className={inputClass} style={inputStyle} {...inputProps} />
    </label>
  );
}

function SectionRenameForm({
  section,
  onSave,
  onCancel,
  saving,
  inputClass,
  inputStyle,
}: {
  section: FFSection;
  onSave: (patch: Partial<FFSection>) => void;
  onCancel: () => void;
  saving: boolean;
  inputClass: string;
  inputStyle: React.CSSProperties;
}) {
  const [labelEn, setLabelEn] = useState(section.label_en);
  const [labelEs, setLabelEs] = useState(section.label_es);

  return (
    <div className="rounded-lg border p-3 flex flex-col gap-3" style={{ borderColor: "var(--wgi-border)", background: "white" }}>
      <h5 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--wgi-text-muted)" }}>Rename Section</h5>
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput label="Label (English)" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} inputClass={inputClass} inputStyle={inputStyle} />
        <LabeledInput label="Etiqueta (Español)" value={labelEs} onChange={(e) => setLabelEs(e.target.value)} inputClass={inputClass} inputStyle={inputStyle} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave({ label_en: labelEn.trim(), label_es: labelEs.trim() })} disabled={saving || !labelEn.trim() || !labelEs.trim()} className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50" style={{ background: "var(--wgi-navy)" }}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-medium border rounded-lg" style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>Cancel</button>
      </div>
    </div>
  );
}

function FieldTypeBadge({ type }: { type: FFFieldType }) {
  const style = FIELD_TYPE_STYLES[type] ?? FIELD_TYPE_STYLES.text;
  const label = FIELD_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: style.bg, color: style.color }}
    >
      {label}
    </span>
  );
}

function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2" r="1.5" />
      <circle cx="8" cy="2" r="1.5" />
      <circle cx="2" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="2" cy="14" r="1.5" />
      <circle cx="8" cy="14" r="1.5" />
    </svg>
  );
}

function buildPreviewField(base: Partial<FFField>, sectionId: string): FFField {
  const type = (base.field_type as FFFieldType) || "text";
  const needsDemoOptions = type === "select" || type === "multiselect";
  return {
    id: "preview",
    section_id: sectionId,
    key: base.key || "preview_field",
    label_en: base.label_en || "Label",
    label_es: base.label_es || "Etiqueta",
    field_type: type,
    is_required: base.is_required ?? false,
    options:
      (base.options as FFField["options"]) ??
      (needsDemoOptions
        ? [
            { value: "option_1", label_en: "Option 1", label_es: "Opción 1" },
            { value: "option_2", label_en: "Option 2", label_es: "Opción 2" },
          ]
        : null),
    placeholder_en: base.placeholder_en ?? null,
    placeholder_es: base.placeholder_es ?? null,
    help_text_en: base.help_text_en ?? null,
    help_text_es: base.help_text_es ?? null,
    order_index: 0,
    created_at: "",
    updated_at: "",
  };
}

function FieldPreviewPanel({ field }: { field: FFField }) {
  const [lang, setLang] = useState<FFLanguage>("en");
  const [value, setValue] = useState<AnswerValue>(
    field.field_type === "multiselect" || field.field_type === "repeating_group"
      ? []
      : field.field_type === "boolean"
        ? null
        : ""
  );

  return (
    <div className="rounded-lg border p-3 flex flex-col gap-3" style={{ borderColor: "var(--wgi-border)", background: "var(--wgi-bg)" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--wgi-text-muted)" }}>
          Preview
        </span>
        <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--wgi-border)" }}>
          {(["en", "es"] as FFLanguage[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className="px-2 py-1 text-xs font-medium"
              style={
                lang === l
                  ? { background: "var(--wgi-navy)", color: "white" }
                  : { background: "white", color: "var(--wgi-text-muted)" }
              }
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="p-3 rounded-lg" style={{ background: "white", border: "1px dashed var(--wgi-border)" }}>
        <FieldRenderer field={field} language={lang} value={value} onChange={(_key, v) => setValue(v)} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Options editor (select / multiselect)
// ---------------------------------------------------------------------------
function OptionsEditor({
  options,
  onChange,
}: {
  options: FFFieldOption[];
  onChange: (options: FFFieldOption[]) => void;
}) {
  const rowInput = "px-2 py-1.5 rounded border text-xs focus:outline-none";
  const rowStyle = { borderColor: "var(--wgi-border)", color: "var(--wgi-text)", background: "white" };

  function update(i: number, patch: Partial<FFFieldOption>) {
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--wgi-text-muted)" }}>
        Options
      </span>
      {options.map((opt, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
          <input className={rowInput} style={rowStyle} placeholder="value" value={opt.value} onChange={(e) => update(i, { value: e.target.value })} />
          <input className={rowInput} style={rowStyle} placeholder="Label EN" value={opt.label_en} onChange={(e) => update(i, { label_en: e.target.value })} />
          <input className={rowInput} style={rowStyle} placeholder="Etiqueta ES" value={opt.label_es} onChange={(e) => update(i, { label_es: e.target.value })} />
          <button type="button" onClick={() => onChange(options.filter((_, idx) => idx !== i))} className="text-xs px-1.5 py-1 rounded hover:opacity-80" style={{ color: "#ef4444" }} aria-label="Remove option">✕</button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, { value: "", label_en: "", label_es: "" }])}
        className="self-start text-xs px-2 py-1 rounded border font-medium"
        style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-navy)" }}
      >
        + Add option
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-fields editor (repeating group)
// ---------------------------------------------------------------------------
function SubFieldsEditor({
  subFields,
  onChange,
}: {
  subFields: FFSubField[];
  onChange: (subFields: FFSubField[]) => void;
}) {
  const rowInput = "px-2 py-1.5 rounded border text-xs focus:outline-none";
  const rowStyle = { borderColor: "var(--wgi-border)", color: "var(--wgi-text)", background: "white" };

  function update(i: number, patch: Partial<FFSubField>) {
    onChange(subFields.map((sf, idx) => (idx === i ? { ...sf, ...patch } : sf)));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--wgi-text-muted)" }}>
        Repeating entry fields
      </span>
      {subFields.map((sf, i) => (
        <div key={i} className="rounded border p-2 flex flex-col gap-2" style={{ borderColor: "var(--wgi-border)" }}>
          <div className="grid grid-cols-4 gap-2 items-center">
            <input className={rowInput} style={rowStyle} placeholder="key" value={sf.key} onChange={(e) => update(i, { key: e.target.value })} />
            <input className={rowInput} style={rowStyle} placeholder="Label EN" value={sf.label_en} onChange={(e) => update(i, { label_en: e.target.value })} />
            <input className={rowInput} style={rowStyle} placeholder="Etiqueta ES" value={sf.label_es} onChange={(e) => update(i, { label_es: e.target.value })} />
            <select
              className={rowInput}
              style={rowStyle}
              value={sf.type}
              onChange={(e) => update(i, { type: e.target.value, options: e.target.value === "select" ? (sf.options ?? []) : undefined })}
            >
              {SUB_FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={sf.required ?? false} onChange={(e) => update(i, { required: e.target.checked })} />
              <span style={{ color: "var(--wgi-text)" }}>Required</span>
            </label>
            <button type="button" onClick={() => onChange(subFields.filter((_, idx) => idx !== i))} className="text-xs px-2 py-1 rounded hover:opacity-80" style={{ color: "#ef4444" }}>Remove</button>
          </div>
          {sf.type === "select" && (
            <OptionsEditor options={(sf.options as FFFieldOption[]) ?? []} onChange={(opts) => update(i, { options: opts })} />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...subFields, { key: "", label_en: "", label_es: "", type: "text" }])}
        className="self-start text-xs px-2 py-1 rounded border font-medium"
        style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-navy)" }}
      >
        + Add entry field
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable section row
// ---------------------------------------------------------------------------
function SortableSectionRow({
  section,
  isExpanded,
  onToggleExpand,
  isRenaming,
  onRequestRename,
  onSaveRename,
  onCancelRename,
  confirmingDeleteSection,
  onRequestDeleteSection,
  onCancelDeleteSection,
  onConfirmDeleteSection,
  expandedField,
  setExpandedField,
  editingField,
  setEditingField,
  addingFieldToSection,
  setAddingFieldToSection,
  confirmDeleteField,
  setConfirmDeleteField,
  createField,
  updateField,
  deleteField,
  moveField,
  sensors,
  saving,
  inputClass,
  inputStyle,
}: {
  section: FFSection & { fields: FFField[] };
  isExpanded: boolean;
  onToggleExpand: () => void;
  isRenaming: boolean;
  onRequestRename: () => void;
  onSaveRename: (patch: Partial<FFSection>) => void;
  onCancelRename: () => void;
  confirmingDeleteSection: boolean;
  onRequestDeleteSection: () => void;
  onCancelDeleteSection: () => void;
  onConfirmDeleteSection: () => void;
  expandedField: string | null;
  setExpandedField: (id: string | null) => void;
  editingField: Partial<FFField> | null;
  setEditingField: React.Dispatch<React.SetStateAction<Partial<FFField> | null>>;
  addingFieldToSection: string | null;
  setAddingFieldToSection: (id: string | null) => void;
  confirmDeleteField: string | null;
  setConfirmDeleteField: (id: string | null) => void;
  createField: (sectionId: string) => Promise<void>;
  updateField: (fieldId: string, sectionId: string, patch: Partial<FFField>) => Promise<void>;
  deleteField: (fieldId: string, sectionId: string) => Promise<void>;
  moveField: (sectionId: string, activeId: string, overId: string) => Promise<void>;
  sensors: ReturnType<typeof useSensors>;
  saving: boolean;
  inputClass: string;
  inputStyle: React.CSSProperties;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  function handleFieldDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    moveField(section.id, String(active.id), String(over.id));
  }

  return (
    <div ref={setNodeRef} style={style} data-section-id={section.id}>
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: "var(--wgi-border)" }}
      >
        {/* Section header */}
        <div className="flex items-center gap-1 px-2 py-3" style={{ background: isExpanded ? "var(--wgi-navy)" : "var(--wgi-bg)" }}>
          <span
            {...attributes}
            {...listeners}
            role="button"
            tabIndex={0}
            aria-label={`Drag to reorder ${section.label_en}`}
            className="flex items-center justify-center px-1.5 py-2 cursor-grab active:cursor-grabbing touch-none"
            style={{ color: isExpanded ? "rgba(255,255,255,0.7)" : "var(--wgi-text-muted)" }}
          >
            <GripIcon />
          </span>
          <button type="button" className="flex-1 text-left" onClick={onToggleExpand}>
            <span className="text-base font-bold" style={{ color: isExpanded ? "white" : "var(--wgi-text)" }}>
              {section.label_en} / {section.label_es}
            </span>
            <span className="ml-2 text-xs" style={{ color: isExpanded ? "rgba(255,255,255,0.6)" : "var(--wgi-text-muted)" }}>
              ({section.fields.length} fields)
            </span>
          </button>

          {confirmingDeleteSection ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-medium" style={{ color: isExpanded ? "#fecaca" : "#991b1b" }}>
                Delete section + {section.fields.length} field{section.fields.length !== 1 ? "s" : ""}?
              </span>
              <button type="button" onClick={onConfirmDeleteSection} className="text-xs px-2 py-1 rounded font-semibold text-white" style={{ background: "#dc2626" }}>Delete</button>
              <button type="button" onClick={onCancelDeleteSection} className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--wgi-border)", color: isExpanded ? "white" : "var(--wgi-text)" }}>Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button type="button" onClick={onRequestRename} className="text-xs px-2 py-1 rounded hover:opacity-80" style={{ color: isExpanded ? "rgba(255,255,255,0.85)" : "var(--wgi-text-muted)" }}>Rename</button>
              <button type="button" onClick={onRequestDeleteSection} className="text-xs px-2 py-1 rounded hover:opacity-80" style={{ color: isExpanded ? "#fca5a5" : "#ef4444" }}>Delete</button>
            </div>
          )}

          <span className="px-2" style={{ color: isExpanded ? "rgba(255,255,255,0.7)" : "var(--wgi-text-muted)" }}>{isExpanded ? "▲" : "▼"}</span>
        </div>

        {/* Section content */}
        {isExpanded && (
          <div className="p-4 flex flex-col gap-3">
            {isRenaming && (
              <SectionRenameForm
                section={section}
                onSave={onSaveRename}
                onCancel={onCancelRename}
                saving={saving}
                inputClass={inputClass}
                inputStyle={inputStyle}
              />
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd}>
              <SortableContext items={section.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3">
                  {section.fields.map((field) => (
                    <SortableFieldRow
                      key={field.id}
                      field={field}
                      isExpanded={expandedField === field.id}
                      onToggleExpand={() => setExpandedField(expandedField === field.id ? null : field.id)}
                      confirming={confirmDeleteField === field.id}
                      onRequestDelete={() => setConfirmDeleteField(field.id)}
                      onCancelDelete={() => setConfirmDeleteField(null)}
                      onConfirmDelete={() => deleteField(field.id, section.id)}
                      onSave={(patch) => updateField(field.id, section.id, patch)}
                      onCancelEdit={() => setExpandedField(null)}
                      saving={saving}
                      inputClass={inputClass}
                      inputStyle={inputStyle}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add field form */}
            {addingFieldToSection === section.id ? (
              <div className="rounded-lg border p-3 flex flex-col gap-3" style={{ borderColor: "var(--wgi-border)", background: "white" }}>
                <h5 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--wgi-text-muted)" }}>New Field</h5>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <LabeledInput label="Key (snake_case)" value={editingField?.key ?? ""} onChange={(e) => setEditingField((p) => ({ ...p, key: e.target.value }))} inputClass={inputClass} inputStyle={inputStyle} placeholder="monthly_income" />
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--wgi-text-muted)" }}>Type</span>
                        <select
                          className={inputClass}
                          style={inputStyle}
                          value={editingField?.field_type ?? ""}
                          onChange={(e) => {
                            const type = e.target.value as FFFieldType;
                            setEditingField((p) => ({ ...p, field_type: type, options: defaultOptionsForType(type) }));
                          }}
                        >
                          <option value="">— Type —</option>
                          {FIELD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      <LabeledInput label="Label (English)" value={editingField?.label_en ?? ""} onChange={(e) => setEditingField((p) => ({ ...p, label_en: e.target.value }))} inputClass={inputClass} inputStyle={inputStyle} placeholder="Monthly Income" />
                      <LabeledInput label="Etiqueta (Español)" value={editingField?.label_es ?? ""} onChange={(e) => setEditingField((p) => ({ ...p, label_es: e.target.value }))} inputClass={inputClass} inputStyle={inputStyle} placeholder="Ingreso Mensual" />
                      <label className="flex items-center gap-2 text-sm cursor-pointer col-span-2">
                        <input type="checkbox" checked={editingField?.is_required ?? false} onChange={(e) => setEditingField((p) => ({ ...p, is_required: e.target.checked }))} />
                        <span style={{ color: "var(--wgi-text)" }}>Required</span>
                      </label>
                    </div>

                    {(editingField?.field_type === "select" || editingField?.field_type === "multiselect") && (
                      <OptionsEditor
                        options={(editingField.options as FFFieldOption[]) ?? []}
                        onChange={(opts) => setEditingField((p) => ({ ...p, options: opts }))}
                      />
                    )}
                    {editingField?.field_type === "repeating_group" && (
                      <SubFieldsEditor
                        subFields={(editingField.options as FFSubField[]) ?? []}
                        onChange={(subFields) => setEditingField((p) => ({ ...p, options: subFields }))}
                      />
                    )}
                  </div>
                  <FieldPreviewPanel key={editingField?.field_type ?? ""} field={buildPreviewField(editingField ?? {}, section.id)} />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => createField(section.id)} disabled={saving} className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50" style={{ background: "var(--wgi-navy)" }}>{saving ? "Adding…" : "Add Field"}</button>
                  <button type="button" onClick={() => { setAddingFieldToSection(null); setEditingField(null); }} className="px-3 py-1.5 text-xs font-medium border rounded-lg" style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setAddingFieldToSection(section.id); setEditingField({}); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:opacity-80"
                style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-navy)", background: "var(--wgi-bg)" }}
              >
                + Add Field
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable field row
// ---------------------------------------------------------------------------
function SortableFieldRow({
  field,
  isExpanded,
  onToggleExpand,
  confirming,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  onSave,
  onCancelEdit,
  saving,
  inputClass,
  inputStyle,
}: {
  field: FFField;
  isExpanded: boolean;
  onToggleExpand: () => void;
  confirming: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onSave: (patch: Partial<FFField>) => void;
  onCancelEdit: () => void;
  saving: boolean;
  inputClass: string;
  inputStyle: React.CSSProperties;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} data-field-id={field.id}>
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
        <div className="flex items-center gap-1 px-2 py-2.5" style={{ background: "var(--wgi-bg)" }}>
          <span
            {...attributes}
            {...listeners}
            role="button"
            tabIndex={0}
            aria-label={`Drag to reorder ${field.label_en}`}
            className="flex items-center justify-center px-1 py-1.5 cursor-grab active:cursor-grabbing touch-none"
            style={{ color: "var(--wgi-text-muted)" }}
          >
            <GripIcon />
          </span>
          <div className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer" onClick={onToggleExpand}>
            <span className="text-sm font-medium truncate" style={{ color: "var(--wgi-text)" }}>{field.label_en}</span>
            <FieldTypeBadge type={field.field_type} />
            {field.is_required && <span className="text-xs" style={{ color: "#ef4444" }}>*</span>}
          </div>

          {confirming ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-medium" style={{ color: "#991b1b" }}>Delete?</span>
              <button type="button" onClick={onConfirmDelete} className="text-xs px-2 py-1 rounded font-semibold text-white" style={{ background: "#dc2626" }}>Delete</button>
              <button type="button" onClick={onCancelDelete} className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={onRequestDelete} className="text-xs px-2 py-1 rounded hover:opacity-80 flex-shrink-0" style={{ color: "#ef4444" }}>Del</button>
          )}
        </div>

        {isExpanded && (
          <FieldEditForm
            field={field}
            onSave={onSave}
            onCancel={onCancelEdit}
            saving={saving}
            inputClass={inputClass}
            inputStyle={inputStyle}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field edit form
// ---------------------------------------------------------------------------
function FieldEditForm({
  field,
  onSave,
  onCancel,
  saving,
  inputClass,
  inputStyle,
}: {
  field: FFField;
  onSave: (patch: Partial<FFField>) => void;
  onCancel: () => void;
  saving: boolean;
  inputClass: string;
  inputStyle: React.CSSProperties;
}) {
  const [patch, setPatch] = useState<Partial<FFField>>({
    label_en: field.label_en,
    label_es: field.label_es,
    field_type: field.field_type,
    options: field.options,
    is_required: field.is_required,
    placeholder_en: field.placeholder_en ?? "",
    placeholder_es: field.placeholder_es ?? "",
    help_text_en: field.help_text_en ?? "",
    help_text_es: field.help_text_es ?? "",
  });
  const typeChanged = patch.field_type !== field.field_type;

  return (
    <div className="px-3 pb-3 flex flex-col gap-4 border-t pt-3" style={{ borderColor: "var(--wgi-border)" }}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput label="Label (English)" value={patch.label_en ?? ""} onChange={(e) => setPatch((p) => ({ ...p, label_en: e.target.value }))} inputClass={inputClass} inputStyle={inputStyle} />
            <LabeledInput label="Etiqueta (Español)" value={patch.label_es ?? ""} onChange={(e) => setPatch((p) => ({ ...p, label_es: e.target.value }))} inputClass={inputClass} inputStyle={inputStyle} />
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--wgi-text-muted)" }}>Type</span>
              <select
                className={inputClass}
                style={inputStyle}
                value={patch.field_type ?? field.field_type}
                onChange={(e) => {
                  const type = e.target.value as FFFieldType;
                  setPatch((p) => ({ ...p, field_type: type, options: defaultOptionsForType(type) }));
                }}
              >
                {FIELD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {typeChanged && (
                <span className="text-xs" style={{ color: "#b45309" }}>
                  Changing type may affect how existing client answers for this field are interpreted.
                </span>
              )}
            </label>
            <LabeledInput label="Placeholder (English)" value={patch.placeholder_en ?? ""} onChange={(e) => setPatch((p) => ({ ...p, placeholder_en: e.target.value }))} inputClass={inputClass} inputStyle={inputStyle} />
            <LabeledInput label="Placeholder (Español)" value={patch.placeholder_es ?? ""} onChange={(e) => setPatch((p) => ({ ...p, placeholder_es: e.target.value }))} inputClass={inputClass} inputStyle={inputStyle} />
            <LabeledInput label="Help text (English)" value={patch.help_text_en ?? ""} onChange={(e) => setPatch((p) => ({ ...p, help_text_en: e.target.value }))} inputClass={inputClass} inputStyle={inputStyle} />
            <LabeledInput label="Texto de ayuda (Español)" value={patch.help_text_es ?? ""} onChange={(e) => setPatch((p) => ({ ...p, help_text_es: e.target.value }))} inputClass={inputClass} inputStyle={inputStyle} />
            <label className="flex items-center gap-2 text-sm cursor-pointer col-span-2">
              <input type="checkbox" checked={patch.is_required ?? false} onChange={(e) => setPatch((p) => ({ ...p, is_required: e.target.checked }))} />
              <span style={{ color: "var(--wgi-text)" }}>Required</span>
            </label>
          </div>

          {(patch.field_type === "select" || patch.field_type === "multiselect") && (
            <OptionsEditor
              options={(patch.options as FFFieldOption[]) ?? []}
              onChange={(opts) => setPatch((p) => ({ ...p, options: opts }))}
            />
          )}
          {patch.field_type === "repeating_group" && (
            <SubFieldsEditor
              subFields={(patch.options as FFSubField[]) ?? []}
              onChange={(subFields) => setPatch((p) => ({ ...p, options: subFields }))}
            />
          )}
        </div>

        <FieldPreviewPanel key={patch.field_type ?? field.field_type} field={{ ...field, ...patch }} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(patch)} disabled={saving} className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50" style={{ background: "var(--wgi-navy)" }}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-medium border rounded-lg" style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>Cancel</button>
      </div>
    </div>
  );
}
