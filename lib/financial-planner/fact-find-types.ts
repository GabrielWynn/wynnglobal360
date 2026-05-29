// =============================================================================
// Financial Planner – Fact Find Types
// =============================================================================

export type FFLanguage = "en" | "es";
export type FFStatus = "in_progress" | "completed" | "abandoned";
export type FFFieldType =
  | "text"
  | "number"
  | "date"
  | "currency"
  | "select"
  | "multiselect"
  | "boolean"
  | "textarea"
  | "repeating_group"
  | "computed";

// ---------------------------------------------------------------------------
// CMS types
// ---------------------------------------------------------------------------

export interface FFFormVersion {
  id: string;
  version_name: string;
  version_number: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FFSection {
  id: string;
  form_version_id: string;
  key: string;
  label_en: string;
  label_es: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  fields?: FFField[];
}

export interface FFFieldOption {
  value: string;
  label_en: string;
  label_es: string;
}

export interface FFSubField {
  key: string;
  label_en: string;
  label_es: string;
  type: string;
  required?: boolean;
  options?: FFFieldOption[];
}

export interface FFField {
  id: string;
  section_id: string;
  key: string;
  label_en: string;
  label_es: string;
  field_type: FFFieldType;
  is_required: boolean;
  options: FFFieldOption[] | FFSubField[] | Record<string, unknown> | null;
  placeholder_en: string | null;
  placeholder_es: string | null;
  help_text_en: string | null;
  help_text_es: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Client types
// ---------------------------------------------------------------------------

export interface FFClient {
  id: string;
  ifa_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateClientPayload {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  nationality?: string;
  notes?: string;
}

export interface UpdateClientPayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  nationality?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Fact Find types
// ---------------------------------------------------------------------------

export interface FFFactFind {
  id: string;
  client_id: string;
  ifa_id: string;
  form_version_id: string;
  language: FFLanguage;
  current_section_index: number;
  completed_section_keys: string[];
  status: FFStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  client?: FFClient;
  ifa_name?: string;
  form_version?: Pick<FFFormVersion, "id" | "version_name" | "version_number">;
}

export interface CreateFactFindPayload {
  client_id: string;
  language: FFLanguage;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export interface FFAnswer {
  id: string;
  fact_find_id: string;
  field_key: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_boolean: boolean | null;
  value_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface CurrencyAnswerValue {
  amount?: number;
  currency?: string;
}

export type AnswerValue =
  | string
  | number
  | boolean
  | null
  | CurrencyAnswerValue
  | unknown[]
  | Record<string, unknown>[];

export interface UpsertAnswerPayload {
  field_key: string;
  value_text?: string | null;
  value_number?: number | null;
  value_date?: string | null;
  value_boolean?: boolean | null;
  value_json?: unknown;
}

export interface UpsertSectionAnswersPayload {
  section_key: string;
  answers: UpsertAnswerPayload[];
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export interface FFNote {
  id: string;
  fact_find_id: string;
  author_id: string;
  content: string;
  is_flagged: boolean;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
  author_name?: string;
}

export interface CreateNotePayload {
  content: string;
  is_flagged?: boolean;
}

export interface UpdateNotePayload {
  content?: string;
  is_flagged?: boolean;
  is_resolved?: boolean;
}

// ---------------------------------------------------------------------------
// Form builder payloads
// ---------------------------------------------------------------------------

export interface CreateSectionPayload {
  key: string;
  label_en: string;
  label_es: string;
}

export interface UpdateSectionPayload {
  label_en?: string;
  label_es?: string;
  order_index?: number;
}

export interface CreateFieldPayload {
  key: string;
  label_en: string;
  label_es: string;
  field_type: FFFieldType;
  is_required?: boolean;
  options?: unknown;
  placeholder_en?: string;
  placeholder_es?: string;
  help_text_en?: string;
  help_text_es?: string;
}

export interface UpdateFieldPayload {
  label_en?: string;
  label_es?: string;
  field_type?: FFFieldType;
  is_required?: boolean;
  options?: unknown;
  placeholder_en?: string;
  placeholder_es?: string;
  help_text_en?: string;
  help_text_es?: string;
  order_index?: number;
}

// ---------------------------------------------------------------------------
// Risk profile
// ---------------------------------------------------------------------------

export type RiskProfile = "conservative" | "balanced" | "growth" | "aggressive";

export function computeRiskProfile(answers: Record<string, string>): RiskProfile | null {
  const questionKeys = ["rt_q1", "rt_q2", "rt_q3", "rt_q4", "rt_q5", "rt_q6", "rt_q7"];
  const scoreMap: Record<string, number> = { a: 1, b: 2, c: 3, d: 4 };

  let total = 0;
  let answered = 0;

  for (const key of questionKeys) {
    const val = answers[key];
    if (val && scoreMap[val] !== undefined) {
      total += scoreMap[val];
      answered++;
    }
  }

  if (answered < questionKeys.length) return null;

  if (total <= 11) return "conservative";
  if (total <= 17) return "balanced";
  if (total <= 23) return "growth";
  return "aggressive";
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function getLabel(
  item: { label_en: string; label_es: string },
  language: FFLanguage
): string {
  return language === "es" ? item.label_es : item.label_en;
}

export function getPlaceholder(
  field: Pick<FFField, "placeholder_en" | "placeholder_es">,
  language: FFLanguage
): string | undefined {
  const val = language === "es" ? field.placeholder_es : field.placeholder_en;
  return val ?? undefined;
}

export function getHelpText(
  field: Pick<FFField, "help_text_en" | "help_text_es">,
  language: FFLanguage
): string | undefined {
  const val = language === "es" ? field.help_text_es : field.help_text_en;
  return val ?? undefined;
}

export function formatDateDisplay(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
