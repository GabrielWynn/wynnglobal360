-- =============================================================================
-- Risk Matrix – Evaluación de Riesgo PLAyFT (client risk classification)
-- Migration: 20261002120000_risk_matrix
-- =============================================================================
--
-- Access control: these tables hold KYC data (PEP status, sanctions hits).
-- RLS is enabled with no policies, so they are reachable only through the
-- service role. The /api/risk-matrix routes and /risk-matrix pages restrict
-- access to ifas.role IN ('admin', 'compliance').

-- ---------------------------------------------------------------------------
-- Clients – one row per evaluated client, keyed by the client ID typed in
-- the evaluation form (case-insensitive).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rm_clients (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key  TEXT        NOT NULL UNIQUE,   -- upper(trim(client_ref))
  client_ref  TEXT        NOT NULL,          -- ID as entered
  name        TEXT        NOT NULL,          -- name on the latest evaluation
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Evaluations – immutable. A change in a client's data is recorded as a new
-- evaluation (re-evaluation), never as an edit.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rm_evaluations (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID         NOT NULL REFERENCES rm_clients(id) ON DELETE RESTRICT,
  evaluation_date      DATE         NOT NULL,
  evaluation_type      TEXT         NOT NULL,
  final_classification TEXT         NOT NULL,
  score                NUMERIC(5,2),            -- NULL when the score could not be computed
  next_review_date     DATE,
  methodology_version  TEXT         NOT NULL,
  answers              JSONB        NOT NULL,   -- form answers as submitted
  result               JSONB        NOT NULL,   -- full scoring breakdown
  evaluator_id         UUID         NOT NULL REFERENCES ifas(id) ON DELETE RESTRICT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rm_evaluations_client
  ON rm_evaluations(client_id, created_at DESC);

ALTER TABLE rm_clients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_evaluations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Client list: each client with its most recent evaluation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW rm_client_summaries
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.client_ref,
  c.name,
  e.id                   AS evaluation_id,
  e.final_classification,
  e.score,
  e.evaluation_date,
  e.next_review_date,
  e.created_at           AS evaluated_at,
  i.name                 AS evaluator_name
FROM rm_clients c
JOIN LATERAL (
  SELECT *
  FROM rm_evaluations
  WHERE client_id = c.id
  ORDER BY created_at DESC
  LIMIT 1
) e ON TRUE
LEFT JOIN ifas i ON i.id = e.evaluator_id;

-- ---------------------------------------------------------------------------
-- Auto-update trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rm_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_rm_clients_updated_at ON rm_clients;
CREATE TRIGGER trg_rm_clients_updated_at
  BEFORE UPDATE ON rm_clients
  FOR EACH ROW EXECUTE FUNCTION rm_set_updated_at();
