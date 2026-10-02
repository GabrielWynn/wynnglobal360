import type { Answers, StoredResult } from "./engine";

/** One row per client with its most recent evaluation (rm_client_summaries). */
export interface ClientSummary {
  id: string;
  client_ref: string;
  name: string;
  evaluation_id: string;
  final_classification: string;
  score: number | null;
  evaluation_date: string;
  next_review_date: string | null;
  evaluated_at: string;
  evaluator_name: string | null;
}

export interface RiskClient {
  id: string;
  client_ref: string;
  name: string;
  /** LACRM ContactId, when the client was evaluated from a LACRM contact. */
  lacrm_contact_id?: string | null;
}

export interface EvaluationRecord {
  id: string;
  evaluation_date: string;
  evaluation_type: string;
  methodology_version: string;
  answers: Answers;
  result: StoredResult;
  evaluator_name: string | null;
  created_at: string;
}
