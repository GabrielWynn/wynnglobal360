-- =============================================================================
-- Risk Matrix – link evaluated clients to their LACRM contact
-- Migration: 20261002130000_risk_matrix_lacrm_link
-- =============================================================================
--
-- Set when an evaluation is started from a LACRM contact (search box in
-- Nueva evaluación). NULL for clients typed in by hand.
-- Safe to re-run.

ALTER TABLE rm_clients
  ADD COLUMN IF NOT EXISTS lacrm_contact_id TEXT;

CREATE INDEX IF NOT EXISTS idx_rm_clients_lacrm_contact
  ON rm_clients(lacrm_contact_id);
