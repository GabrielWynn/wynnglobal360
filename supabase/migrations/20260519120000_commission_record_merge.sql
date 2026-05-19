-- ============================================================
-- 20260519120000_commission_record_merge.sql
-- Traceability for admin-initiated row merges in master file.
-- ============================================================

ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES commission_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merge_source_ids UUID[];

CREATE INDEX IF NOT EXISTS idx_commission_records_merged_into
  ON commission_records(merged_into_id)
  WHERE merged_into_id IS NOT NULL;
