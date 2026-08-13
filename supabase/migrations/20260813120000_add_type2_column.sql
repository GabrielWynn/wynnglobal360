-- ============================================================
-- 20260813120000_add_type2_column.sql
-- Type2 column: stores the ISIN for Structured Note commission rows
-- (IDAD platform and any future structured-note platform imports).
-- ============================================================

ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS type2 TEXT;

COMMENT ON COLUMN commission_records.type2 IS 'Secondary type / ISIN for Structured Notes commission rows.';

-- Lets admins map a CSV "ISIN" column to commission_records.type2 when
-- saving a platform's column mapping (Structured Notes imports).
ALTER TABLE platform_column_mappings
  ADD COLUMN IF NOT EXISTS type2_col TEXT;
