-- Add Pdng% (editable) and Pdng$ (generated) columns to commission_records
ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS pending_percentage NUMERIC(9,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_amount NUMERIC(14,2) GENERATED ALWAYS AS (ROUND((amount * pending_percentage)::numeric, 2)) STORED;
