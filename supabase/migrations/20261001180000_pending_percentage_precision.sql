-- ============================================================
-- 20261001180000_pending_percentage_precision.sql
-- pending_percentage NUMERIC(9,4) -> NUMERIC(10,6), matching the other three
-- split percentages. A merge blends percentages to 6dp; at 4dp the blended
-- pending split drifted from the sum of the merged rows.
-- ============================================================

-- A column used by a generated column cannot change type in place.
ALTER TABLE commission_records DROP COLUMN pending_amount;
ALTER TABLE commission_records ALTER COLUMN pending_percentage TYPE NUMERIC(10,6);
ALTER TABLE commission_records ADD COLUMN pending_amount NUMERIC(20,6)
  GENERATED ALWAYS AS ((amount + COALESCE(variable_amount, 0)) * pending_percentage) STORED;

NOTIFY pgrst, 'reload schema';
