// ---------------------------------------------------------------------------
// Matriz de Riesgo PLAyFT — data access (server-side only, service role).
// Callers are responsible for the admin/compliance role check.
// ---------------------------------------------------------------------------

import { supabaseAdmin } from "@/lib/supabase";
import { toStoredResult, type Answers, type Evaluation, type StoredResult } from "./engine";
import type { ClientSummary, EvaluationRecord, RiskClient } from "./types";

const PAGE_SIZE = 1000;

export async function listClientSummaries(): Promise<ClientSummary[]> {
  const rows: ClientSummary[] = [];

  // PostgREST caps a response at 1000 rows, so page through the view
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("rm_client_summaries")
      .select("*")
      .order("evaluated_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as ClientSummary[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows.map((r) => ({ ...r, score: r.score == null ? null : Number(r.score) }));
}

/**
 * Clients with a scheduled review, soonest first. Pass `until` (YYYY-MM-DD)
 * to keep only reviews falling on or before that date.
 */
export async function listReviews(until?: string): Promise<ClientSummary[]> {
  const rows: ClientSummary[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabaseAdmin
      .from("rm_client_summaries")
      .select("*")
      .not("next_review_date", "is", null);
    if (until) query = query.lte("next_review_date", until);

    const { data, error } = await query
      .order("next_review_date")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as ClientSummary[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows.map((r) => ({ ...r, score: r.score == null ? null : Number(r.score) }));
}

export async function countReviewsDue(until: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("rm_client_summaries")
    .select("id", { count: "exact", head: true })
    .lte("next_review_date", until);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getClientWithEvaluations(
  clientId: string
): Promise<{ client: RiskClient; evaluations: EvaluationRecord[] } | null> {
  const { data: client, error: clientError } = await supabaseAdmin
    .from("rm_clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle();

  if (clientError) throw new Error(clientError.message);
  if (!client) return null;

  const { data, error } = await supabaseAdmin
    .from("rm_evaluations")
    .select(
      "id, evaluation_date, evaluation_type, methodology_version, answers, result, created_at, evaluator:ifas(name)"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  type Row = Omit<EvaluationRecord, "evaluator_name" | "answers" | "result"> & {
    answers: Answers;
    result: StoredResult;
    evaluator: { name: string | null } | { name: string | null }[] | null;
  };

  const evaluations = ((data ?? []) as unknown as Row[]).map(({ evaluator, ...e }) => ({
    ...e,
    evaluator_name: (Array.isArray(evaluator) ? evaluator[0]?.name : evaluator?.name) ?? null,
  }));

  return { client: client as RiskClient, evaluations };
}

/**
 * Stores an evaluation. Evaluations are immutable: a change to a client's
 * data is recorded as a new evaluation, never as an edit.
 */
export async function saveEvaluation(
  answers: Answers,
  x: Evaluation,
  evaluatorIfaId: string,
  lacrmContactId?: string
): Promise<{ clientId: string; evaluationId: string }> {
  const clientRef = (answers.id ?? "").trim();
  const name = (answers.nombre ?? "").trim();

  const { data: client, error: clientError } = await supabaseAdmin
    .from("rm_clients")
    .upsert(
      {
        client_key: clientRef.toUpperCase(),
        client_ref: clientRef,
        name,
        // Only set when the evaluation started from LACRM, so an existing link is kept
        ...(lacrmContactId ? { lacrm_contact_id: lacrmContactId } : {}),
      },
      { onConflict: "client_key" }
    )
    .select("id")
    .single();

  if (clientError) throw new Error(clientError.message);
  const clientId = (client as { id: string }).id;

  const { data: evaluation, error } = await supabaseAdmin
    .from("rm_evaluations")
    .insert({
      client_id: clientId,
      evaluation_date: answers.fe,
      evaluation_type: answers.tipo_eval,
      final_classification: x.final,
      score: x.score,
      next_review_date: x.proxima,
      methodology_version: x.version,
      answers,
      result: toStoredResult(x),
      evaluator_id: evaluatorIfaId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { clientId, evaluationId: (evaluation as { id: string }).id };
}
