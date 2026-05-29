import { supabaseAdmin } from "@/lib/supabase";
import {
  computeRiskProfile,
  type CreateClientPayload,
  type CreateFactFindPayload,
  type CreateFieldPayload,
  type CreateNotePayload,
  type CreateSectionPayload,
  type FFAnswer,
  type FFClient,
  type FFFactFind,
  type FFField,
  type FFFormVersion,
  type FFNote,
  type FFSection,
  type UpdateClientPayload,
  type UpdateFieldPayload,
  type UpdateNotePayload,
  type UpdateSectionPayload,
  type UpsertAnswerPayload,
} from "./fact-find-types";

// =============================================================================
// Form Versions
// =============================================================================

export async function listFormVersions(): Promise<FFFormVersion[]> {
  const { data, error } = await supabaseAdmin
    .from("fp_form_versions")
    .select("*")
    .order("version_number", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FFFormVersion[];
}

export async function getFormVersionById(id: string): Promise<FFFormVersion | null> {
  const { data, error } = await supabaseAdmin
    .from("fp_form_versions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FFFormVersion | null) ?? null;
}

export async function getActiveFormVersion(): Promise<FFFormVersion | null> {
  const { data, error } = await supabaseAdmin
    .from("fp_form_versions")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FFFormVersion | null) ?? null;
}

export async function createFormVersion(
  version_name: string,
  notes?: string
): Promise<FFFormVersion> {
  const { data: latest } = await supabaseAdmin
    .from("fp_form_versions")
    .select("version_number")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextNumber = ((latest as { version_number: number } | null)?.version_number ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from("fp_form_versions")
    .insert({ version_name, version_number: nextNumber, notes: notes ?? null, is_active: false })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as FFFormVersion;
}

export async function activateFormVersion(id: string): Promise<void> {
  await supabaseAdmin
    .from("fp_form_versions")
    .update({ is_active: false })
    .neq("id", id);

  const { error } = await supabaseAdmin
    .from("fp_form_versions")
    .update({ is_active: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function countInProgressFactFindsForVersion(versionId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("fp_fact_finds")
    .select("id", { count: "exact", head: true })
    .eq("form_version_id", versionId)
    .eq("status", "in_progress");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// =============================================================================
// Sections
// =============================================================================

export async function listSections(formVersionId: string): Promise<FFSection[]> {
  const { data, error } = await supabaseAdmin
    .from("fp_sections")
    .select("*")
    .eq("form_version_id", formVersionId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FFSection[];
}

export async function getSectionById(id: string): Promise<FFSection | null> {
  const { data, error } = await supabaseAdmin
    .from("fp_sections")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FFSection | null) ?? null;
}

export async function createSection(
  formVersionId: string,
  payload: CreateSectionPayload
): Promise<FFSection> {
  const { data: last } = await supabaseAdmin
    .from("fp_sections")
    .select("order_index")
    .eq("form_version_id", formVersionId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = ((last as { order_index: number } | null)?.order_index ?? -1) + 1;

  const { data, error } = await supabaseAdmin
    .from("fp_sections")
    .insert({ form_version_id: formVersionId, ...payload, order_index: nextOrder })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as FFSection;
}

export async function updateSection(
  id: string,
  payload: UpdateSectionPayload
): Promise<FFSection | null> {
  const { data, error } = await supabaseAdmin
    .from("fp_sections")
    .update(payload)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FFSection | null) ?? null;
}

export async function deleteSection(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("fp_sections")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reorderSection(id: string, direction: "up" | "down"): Promise<void> {
  const section = await getSectionById(id);
  if (!section) throw new Error("Section not found");

  const siblingOrder =
    direction === "up" ? section.order_index - 1 : section.order_index + 1;

  const { data: sibling } = await supabaseAdmin
    .from("fp_sections")
    .select("id")
    .eq("form_version_id", section.form_version_id)
    .eq("order_index", siblingOrder)
    .maybeSingle();

  if (!sibling) return;

  await supabaseAdmin
    .from("fp_sections")
    .update({ order_index: siblingOrder })
    .eq("id", id);

  await supabaseAdmin
    .from("fp_sections")
    .update({ order_index: section.order_index })
    .eq("id", (sibling as { id: string }).id);
}

// =============================================================================
// Fields
// =============================================================================

export async function listFields(sectionId: string): Promise<FFField[]> {
  const { data, error } = await supabaseAdmin
    .from("fp_fields")
    .select("*")
    .eq("section_id", sectionId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FFField[];
}

export async function getFieldById(id: string): Promise<FFField | null> {
  const { data, error } = await supabaseAdmin
    .from("fp_fields")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FFField | null) ?? null;
}

export async function createField(
  sectionId: string,
  payload: CreateFieldPayload
): Promise<FFField> {
  const { data: last } = await supabaseAdmin
    .from("fp_fields")
    .select("order_index")
    .eq("section_id", sectionId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = ((last as { order_index: number } | null)?.order_index ?? -1) + 1;

  const { data, error } = await supabaseAdmin
    .from("fp_fields")
    .insert({
      section_id: sectionId,
      key: payload.key,
      label_en: payload.label_en,
      label_es: payload.label_es,
      field_type: payload.field_type,
      is_required: payload.is_required ?? false,
      options: payload.options ?? null,
      placeholder_en: payload.placeholder_en ?? null,
      placeholder_es: payload.placeholder_es ?? null,
      help_text_en: payload.help_text_en ?? null,
      help_text_es: payload.help_text_es ?? null,
      order_index: nextOrder,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as FFField;
}

export async function updateField(
  id: string,
  payload: UpdateFieldPayload
): Promise<FFField | null> {
  const updates: Record<string, unknown> = {};
  if (payload.label_en !== undefined) updates.label_en = payload.label_en;
  if (payload.label_es !== undefined) updates.label_es = payload.label_es;
  if (payload.field_type !== undefined) updates.field_type = payload.field_type;
  if (payload.is_required !== undefined) updates.is_required = payload.is_required;
  if (payload.options !== undefined) updates.options = payload.options;
  if (payload.placeholder_en !== undefined) updates.placeholder_en = payload.placeholder_en;
  if (payload.placeholder_es !== undefined) updates.placeholder_es = payload.placeholder_es;
  if (payload.help_text_en !== undefined) updates.help_text_en = payload.help_text_en;
  if (payload.help_text_es !== undefined) updates.help_text_es = payload.help_text_es;
  if (payload.order_index !== undefined) updates.order_index = payload.order_index;

  const { data, error } = await supabaseAdmin
    .from("fp_fields")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FFField | null) ?? null;
}

export async function deleteField(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("fp_fields")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reorderField(id: string, direction: "up" | "down"): Promise<void> {
  const field = await getFieldById(id);
  if (!field) throw new Error("Field not found");

  const siblingOrder =
    direction === "up" ? field.order_index - 1 : field.order_index + 1;

  const { data: sibling } = await supabaseAdmin
    .from("fp_fields")
    .select("id")
    .eq("section_id", field.section_id)
    .eq("order_index", siblingOrder)
    .maybeSingle();

  if (!sibling) return;

  await supabaseAdmin
    .from("fp_fields")
    .update({ order_index: siblingOrder })
    .eq("id", id);

  await supabaseAdmin
    .from("fp_fields")
    .update({ order_index: field.order_index })
    .eq("id", (sibling as { id: string }).id);
}

// =============================================================================
// Clients
// =============================================================================

export async function listClients(ifaId: string): Promise<FFClient[]> {
  const { data, error } = await supabaseAdmin
    .from("fp_clients")
    .select("*")
    .eq("ifa_id", ifaId)
    .order("last_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FFClient[];
}

export async function getClientById(id: string, ifaId?: string): Promise<FFClient | null> {
  let query = supabaseAdmin.from("fp_clients").select("*").eq("id", id);
  if (ifaId) query = query.eq("ifa_id", ifaId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FFClient | null) ?? null;
}

export async function createClient(
  ifaId: string,
  payload: CreateClientPayload
): Promise<FFClient> {
  const { data, error } = await supabaseAdmin
    .from("fp_clients")
    .insert({
      ifa_id: ifaId,
      first_name: payload.first_name.trim(),
      last_name: payload.last_name.trim(),
      email: payload.email?.trim() ?? null,
      phone: payload.phone?.trim() ?? null,
      date_of_birth: payload.date_of_birth ?? null,
      nationality: payload.nationality?.trim() ?? null,
      notes: payload.notes?.trim() ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as FFClient;
}

export async function updateClient(
  id: string,
  ifaId: string,
  payload: UpdateClientPayload
): Promise<FFClient | null> {
  const updates: Record<string, unknown> = {};
  if (payload.first_name !== undefined) updates.first_name = payload.first_name.trim();
  if (payload.last_name !== undefined) updates.last_name = payload.last_name.trim();
  if (payload.email !== undefined) updates.email = payload.email?.trim() ?? null;
  if (payload.phone !== undefined) updates.phone = payload.phone?.trim() ?? null;
  if (payload.date_of_birth !== undefined) updates.date_of_birth = payload.date_of_birth ?? null;
  if (payload.nationality !== undefined) updates.nationality = payload.nationality?.trim() ?? null;
  if (payload.notes !== undefined) updates.notes = payload.notes?.trim() ?? null;

  const { data, error } = await supabaseAdmin
    .from("fp_clients")
    .update(updates)
    .eq("id", id)
    .eq("ifa_id", ifaId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FFClient | null) ?? null;
}

// =============================================================================
// Fact Finds
// =============================================================================

export async function listFactFinds(ifaId: string): Promise<FFFactFind[]> {
  const { data, error } = await supabaseAdmin
    .from("fp_fact_finds")
    .select(`
      *,
      client:fp_clients(id, first_name, last_name, email),
      form_version:fp_form_versions(id, version_name, version_number)
    `)
    .eq("ifa_id", ifaId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FFFactFind[];
}

export async function listAllFactFinds(): Promise<FFFactFind[]> {
  const { data, error } = await supabaseAdmin
    .from("fp_fact_finds")
    .select(`
      *,
      client:fp_clients(id, first_name, last_name, email),
      form_version:fp_form_versions(id, version_name, version_number),
      ifa:ifas(id, name, email)
    `)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FFFactFind[];
}

export async function getFactFindById(
  id: string,
  ifaId?: string
): Promise<FFFactFind | null> {
  let query = supabaseAdmin
    .from("fp_fact_finds")
    .select(`
      *,
      client:fp_clients(*),
      form_version:fp_form_versions(id, version_name, version_number)
    `)
    .eq("id", id);

  if (ifaId) query = query.eq("ifa_id", ifaId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as FFFactFind | null) ?? null;
}

export async function createFactFind(
  ifaId: string,
  payload: CreateFactFindPayload
): Promise<FFFactFind> {
  const activeVersion = await getActiveFormVersion();
  if (!activeVersion) throw new Error("No active form version found");

  const { data, error } = await supabaseAdmin
    .from("fp_fact_finds")
    .insert({
      client_id: payload.client_id,
      ifa_id: ifaId,
      form_version_id: activeVersion.id,
      language: payload.language,
      current_section_index: 0,
      completed_section_keys: [],
      status: "in_progress",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as FFFactFind;
}

export async function submitFactFind(id: string, ifaId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("fp_fact_finds")
    .update({ status: "completed", submitted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("ifa_id", ifaId);
  if (error) throw new Error(error.message);
}

// =============================================================================
// Answers
// =============================================================================

export async function getAnswersForFactFind(factFindId: string): Promise<FFAnswer[]> {
  const { data, error } = await supabaseAdmin
    .from("fp_answers")
    .select("*")
    .eq("fact_find_id", factFindId);
  if (error) throw new Error(error.message);
  return (data ?? []) as FFAnswer[];
}

export async function upsertSectionAnswers(
  factFindId: string,
  ifaId: string,
  sectionKey: string,
  answers: UpsertAnswerPayload[]
): Promise<void> {
  // Verify ownership
  const ff = await getFactFindById(factFindId, ifaId);
  if (!ff) throw new Error("Fact find not found or access denied");
  if (ff.status === "completed") throw new Error("Fact find already completed");

  const rows = answers.map((a) => ({
    fact_find_id: factFindId,
    field_key: a.field_key,
    value_text: a.value_text ?? null,
    value_number: a.value_number ?? null,
    value_date: a.value_date ?? null,
    value_boolean: a.value_boolean ?? null,
    value_json: a.value_json ?? null,
  }));

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("fp_answers")
      .upsert(rows, { onConflict: "fact_find_id,field_key" });
    if (error) throw new Error(error.message);
  }

  // Compute and store risk profile if this is the risk_tolerance section
  if (sectionKey === "risk_tolerance") {
    await computeAndStoreRiskProfile(factFindId);
  }

  // Mark section as completed and update current_section_index
  const completedKeys: string[] = Array.isArray(ff.completed_section_keys)
    ? [...ff.completed_section_keys]
    : [];

  if (!completedKeys.includes(sectionKey)) {
    completedKeys.push(sectionKey);
  }

  // Get total sections to update current_section_index
  const { data: sections } = await supabaseAdmin
    .from("fp_sections")
    .select("key, order_index")
    .eq("form_version_id", ff.form_version_id)
    .order("order_index", { ascending: true });

  const sectionList = (sections ?? []) as { key: string; order_index: number }[];
  const currentSectionIdx = sectionList.findIndex((s) => s.key === sectionKey);
  const nextSectionIndex = Math.min(currentSectionIdx + 1, sectionList.length - 1);

  await supabaseAdmin
    .from("fp_fact_finds")
    .update({
      completed_section_keys: completedKeys,
      current_section_index: Math.max(ff.current_section_index, nextSectionIndex),
    })
    .eq("id", factFindId);
}

async function computeAndStoreRiskProfile(factFindId: string): Promise<void> {
  const answers = await getAnswersForFactFind(factFindId);
  const answerMap: Record<string, string> = {};

  for (const a of answers) {
    if (a.field_key.startsWith("rt_q") && a.value_text) {
      answerMap[a.field_key] = a.value_text;
    }
  }

  const profile = computeRiskProfile(answerMap);
  if (!profile) return;

  await supabaseAdmin.from("fp_answers").upsert(
    {
      fact_find_id: factFindId,
      field_key: "rt_profile_result",
      value_text: profile,
    },
    { onConflict: "fact_find_id,field_key" }
  );
}

// =============================================================================
// Notes
// =============================================================================

export async function listNotes(factFindId: string): Promise<FFNote[]> {
  const { data, error } = await supabaseAdmin
    .from("fp_notes")
    .select(`
      *,
      author:ifas(id, name)
    `)
    .eq("fact_find_id", factFindId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((n: Record<string, unknown>) => ({
    ...(n as FFNote),
    author_name: (n.author as { name?: string } | null)?.name,
  }));
}

export async function createNote(
  factFindId: string,
  authorIfaId: string,
  payload: CreateNotePayload
): Promise<FFNote> {
  const { data, error } = await supabaseAdmin
    .from("fp_notes")
    .insert({
      fact_find_id: factFindId,
      author_id: authorIfaId,
      content: payload.content.trim(),
      is_flagged: payload.is_flagged ?? false,
      is_resolved: false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as FFNote;
}

export async function updateNote(
  id: string,
  payload: UpdateNotePayload
): Promise<FFNote | null> {
  const updates: Record<string, unknown> = {};
  if (payload.content !== undefined) updates.content = payload.content.trim();
  if (payload.is_flagged !== undefined) updates.is_flagged = payload.is_flagged;
  if (payload.is_resolved !== undefined) updates.is_resolved = payload.is_resolved;

  const { data, error } = await supabaseAdmin
    .from("fp_notes")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FFNote | null) ?? null;
}

// =============================================================================
// Full form version with sections + fields (used by the wizard)
// =============================================================================

export async function getFormVersionWithContent(
  versionId: string
): Promise<(FFSection & { fields: FFField[] })[]> {
  const sections = await listSections(versionId);
  const withFields = await Promise.all(
    sections.map(async (s) => ({ ...s, fields: await listFields(s.id) }))
  );
  return withFields;
}
