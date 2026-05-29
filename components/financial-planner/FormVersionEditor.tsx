"use client";

import { useState } from "react";
import { getAuthHeaders } from "@/lib/supabase";
import type {
  FFField,
  FFFieldType,
  FFSection,
} from "@/lib/financial-planner/fact-find-types";

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

export default function FormVersionEditor({
  versionId,
  versionName,
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } finally {
      setSaving(false);
    }
  }

  async function updateSection(id: string, patch: Partial<FFSection>) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiCall(`/api/financial-planner/sections/${id}`, "PATCH", patch);
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSections((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...data.section } : s))
      );
    } finally {
      setSaving(false);
    }
  }

  async function reorderSection(id: string, direction: "up" | "down") {
    const res = await apiCall(`/api/financial-planner/sections/${id}/reorder`, "POST", { direction });
    if (res.ok) {
      setSections((prev) => {
        const idx = prev.findIndex((s) => s.id === id);
        if (idx < 0) return prev;
        const next = [...prev];
        const swap = direction === "up" ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= next.length) return prev;
        [next[idx], next[swap]] = [next[swap], next[idx]];
        return next;
      });
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
    } finally {
      setSaving(false);
    }
  }

  async function deleteField(fieldId: string, sectionId: string) {
    if (!confirm("Delete this field? This cannot be undone.")) return;
    const res = await apiCall(`/api/financial-planner/fields/${fieldId}`, "DELETE");
    if (res.ok) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) }
            : s
        )
      );
    }
  }

  async function reorderField(fieldId: string, sectionId: string, direction: "up" | "down") {
    const res = await apiCall(`/api/financial-planner/fields/${fieldId}/reorder`, "POST", { direction });
    if (res.ok) {
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          const idx = s.fields.findIndex((f) => f.id === fieldId);
          if (idx < 0) return s;
          const next = [...s.fields];
          const swap = direction === "up" ? idx - 1 : idx + 1;
          if (swap < 0 || swap >= next.length) return s;
          [next[idx], next[swap]] = [next[swap], next[idx]];
          return { ...s, fields: next };
        })
      );
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const inputClass = "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none";
  const inputStyle = { borderColor: "var(--wgi-border)", color: "var(--wgi-text)", background: "white" };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
          {sections.length} section{sections.length !== 1 ? "s" : ""}
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
          <h4 className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>New Section</h4>
          <input type="text" className={inputClass} style={inputStyle} placeholder="Key (snake_case)" value={editingSection?.key ?? ""} onChange={(e) => setEditingSection((p) => ({ ...p, key: e.target.value }))} />
          <input type="text" className={inputClass} style={inputStyle} placeholder="Label (English)" value={editingSection?.label_en ?? ""} onChange={(e) => setEditingSection((p) => ({ ...p, label_en: e.target.value }))} />
          <input type="text" className={inputClass} style={inputStyle} placeholder="Etiqueta (Español)" value={editingSection?.label_es ?? ""} onChange={(e) => setEditingSection((p) => ({ ...p, label_es: e.target.value }))} />
          <div className="flex gap-2">
            <button type="button" onClick={createSection} disabled={saving} className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--wgi-navy)" }}>{saving ? "Saving…" : "Add"}</button>
            <button type="button" onClick={() => { setAddingSection(false); setEditingSection(null); }} className="px-4 py-1.5 rounded-lg text-sm font-medium border" style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.map((section, sIdx) => {
        const isExpanded = expandedSection === section.id;
        return (
          <div key={section.id} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
            {/* Section header */}
            <div className="flex items-center gap-2 px-4 py-3" style={{ background: isExpanded ? "var(--wgi-navy)" : "var(--wgi-bg)" }}>
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button type="button" disabled={sIdx === 0} onClick={() => reorderSection(section.id, "up")} className="text-xs leading-none disabled:opacity-30" style={{ color: isExpanded ? "white" : "var(--wgi-text-muted)" }}>▲</button>
                <button type="button" disabled={sIdx === sections.length - 1} onClick={() => reorderSection(section.id, "down")} className="text-xs leading-none disabled:opacity-30" style={{ color: isExpanded ? "white" : "var(--wgi-text-muted)" }}>▼</button>
              </div>
              <button type="button" className="flex-1 text-left" onClick={() => setExpandedSection(isExpanded ? null : section.id)}>
                <span className="text-sm font-semibold" style={{ color: isExpanded ? "white" : "var(--wgi-text)" }}>
                  {section.label_en} / {section.label_es}
                </span>
                <span className="ml-2 text-xs" style={{ color: isExpanded ? "rgba(255,255,255,0.6)" : "var(--wgi-text-muted)" }}>
                  ({section.fields.length} fields)
                </span>
              </button>
              <span style={{ color: isExpanded ? "rgba(255,255,255,0.7)" : "var(--wgi-text-muted)" }}>{isExpanded ? "▲" : "▼"}</span>
            </div>

            {/* Section content */}
            {isExpanded && (
              <div className="p-4 flex flex-col gap-3">
                {/* Fields */}
                {section.fields.map((field, fIdx) => {
                  const isFieldExpanded = expandedField === field.id;
                  return (
                    <div key={field.id} className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
                      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "var(--wgi-bg)" }}>
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button type="button" disabled={fIdx === 0} onClick={() => reorderField(field.id, section.id, "up")} className="text-xs leading-none disabled:opacity-30" style={{ color: "var(--wgi-text-muted)" }}>▲</button>
                          <button type="button" disabled={fIdx === section.fields.length - 1} onClick={() => reorderField(field.id, section.id, "down")} className="text-xs leading-none disabled:opacity-30" style={{ color: "var(--wgi-text-muted)" }}>▼</button>
                        </div>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedField(isFieldExpanded ? null : field.id)}>
                          <span className="text-sm font-medium" style={{ color: "var(--wgi-text)" }}>{field.label_en}</span>
                          <span className="ml-2 text-xs font-mono" style={{ color: "var(--wgi-text-muted)" }}>
                            [{field.field_type}]{field.is_required ? " *" : ""}
                          </span>
                        </div>
                        <button type="button" onClick={() => deleteField(field.id, section.id)} className="text-xs px-2 py-1 rounded hover:opacity-80" style={{ color: "#ef4444" }}>Del</button>
                      </div>

                      {isFieldExpanded && (
                        <FieldEditForm
                          field={field}
                          onSave={(patch) => updateField(field.id, section.id, patch)}
                          onCancel={() => setExpandedField(null)}
                          saving={saving}
                          inputClass={inputClass}
                          inputStyle={inputStyle}
                        />
                      )}
                    </div>
                  );
                })}

                {/* Add field form */}
                {addingFieldToSection === section.id ? (
                  <div className="rounded-lg border p-3 flex flex-col gap-3" style={{ borderColor: "var(--wgi-border)", background: "white" }}>
                    <h5 className="text-xs font-semibold uppercase" style={{ color: "var(--wgi-text-muted)" }}>New Field</h5>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" className={inputClass} style={inputStyle} placeholder="key (snake_case)" value={editingField?.key ?? ""} onChange={(e) => setEditingField((p) => ({ ...p, key: e.target.value }))} />
                      <select className={inputClass} style={inputStyle} value={editingField?.field_type ?? ""} onChange={(e) => setEditingField((p) => ({ ...p, field_type: e.target.value as FFFieldType }))}>
                        <option value="">— Type —</option>
                        {FIELD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <input type="text" className={inputClass} style={inputStyle} placeholder="Label (English)" value={editingField?.label_en ?? ""} onChange={(e) => setEditingField((p) => ({ ...p, label_en: e.target.value }))} />
                      <input type="text" className={inputClass} style={inputStyle} placeholder="Etiqueta (Español)" value={editingField?.label_es ?? ""} onChange={(e) => setEditingField((p) => ({ ...p, label_es: e.target.value }))} />
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={editingField?.is_required ?? false} onChange={(e) => setEditingField((p) => ({ ...p, is_required: e.target.checked }))} />
                      <span style={{ color: "var(--wgi-text)" }}>Required</span>
                    </label>
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
        );
      })}
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
    is_required: field.is_required,
    placeholder_en: field.placeholder_en ?? "",
    placeholder_es: field.placeholder_es ?? "",
    help_text_en: field.help_text_en ?? "",
    help_text_es: field.help_text_es ?? "",
  });

  return (
    <div className="px-3 pb-3 flex flex-col gap-3 border-t pt-3" style={{ borderColor: "var(--wgi-border)" }}>
      <div className="grid grid-cols-2 gap-2">
        <input type="text" className={inputClass} style={inputStyle} placeholder="Label (English)" value={patch.label_en ?? ""} onChange={(e) => setPatch((p) => ({ ...p, label_en: e.target.value }))} />
        <input type="text" className={inputClass} style={inputStyle} placeholder="Etiqueta (Español)" value={patch.label_es ?? ""} onChange={(e) => setPatch((p) => ({ ...p, label_es: e.target.value }))} />
        <input type="text" className={inputClass} style={inputStyle} placeholder="Placeholder EN" value={patch.placeholder_en ?? ""} onChange={(e) => setPatch((p) => ({ ...p, placeholder_en: e.target.value }))} />
        <input type="text" className={inputClass} style={inputStyle} placeholder="Placeholder ES" value={patch.placeholder_es ?? ""} onChange={(e) => setPatch((p) => ({ ...p, placeholder_es: e.target.value }))} />
        <input type="text" className={inputClass} style={inputStyle} placeholder="Help text EN" value={patch.help_text_en ?? ""} onChange={(e) => setPatch((p) => ({ ...p, help_text_en: e.target.value }))} />
        <input type="text" className={inputClass} style={inputStyle} placeholder="Help text ES" value={patch.help_text_es ?? ""} onChange={(e) => setPatch((p) => ({ ...p, help_text_es: e.target.value }))} />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={patch.is_required ?? false} onChange={(e) => setPatch((p) => ({ ...p, is_required: e.target.checked }))} />
        <span style={{ color: "var(--wgi-text)" }}>Required</span>
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(patch)} disabled={saving} className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50" style={{ background: "var(--wgi-navy)" }}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-medium border rounded-lg" style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}>Cancel</button>
      </div>
    </div>
  );
}
