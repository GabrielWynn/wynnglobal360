-- ============================================================
-- 20260518_commission_allocations.sql
-- Opt-in per-record commission allocation splits.
-- Allows a WGI/IFA/Suspense % to be redirected to a secondary
-- IFA, creating a real child commission_record for their balance.
-- ============================================================

-- Mark child allocation records so they can be styled/filtered
-- distinctly in the master file. Not used for advance reconciliation.
ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS allocation_parent_id UUID
    REFERENCES commission_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commission_records_allocation_parent
  ON commission_records(allocation_parent_id);

-- Stores the allocation rule: one row per split line per parent record.
-- Multiple rows per parent_record_id are supported (e.g. 2% + 2%).
CREATE TABLE IF NOT EXISTS commission_allocations (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_record_id    UUID        NOT NULL REFERENCES commission_records(id) ON DELETE CASCADE,
  child_record_id     UUID        REFERENCES commission_records(id) ON DELETE SET NULL,
  secondary_ifa_id    UUID        REFERENCES ifas(id) ON DELETE SET NULL,
  secondary_ifa_code  VARCHAR(50) NOT NULL,
  secondary_ifa_name  TEXT,
  -- Stored as 0-1 decimal, e.g. 0.04 for 4%
  percentage          NUMERIC(9,4) NOT NULL CHECK (percentage > 0 AND percentage <= 1),
  -- Which bucket the % is taken from: wgi | ifa | suspense
  source_bucket       VARCHAR(20) NOT NULL DEFAULT 'wgi'
                        CHECK (source_bucket IN ('wgi', 'ifa', 'suspense')),
  notes               TEXT,
  created_by          UUID        REFERENCES ifas(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_allocations_parent
  ON commission_allocations(parent_record_id);

CREATE INDEX IF NOT EXISTS idx_commission_allocations_child
  ON commission_allocations(child_record_id);
