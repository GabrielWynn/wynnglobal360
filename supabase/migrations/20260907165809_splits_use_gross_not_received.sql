-- Split calculations (IFA Comm, IFA Susp, WG O/R, Pdng$, Unpaid) were based on
-- "Received" (amount) alone. They should be based on "Gross" (amount +
-- variable_amount, i.e. Received + Expect) instead, matching the Gross column
-- shown in the master file grid.
--
-- variable_amount is nullable (one live row is NULL) — COALESCE to 0 so that
-- row keeps a computed value instead of flipping to NULL under the new formula.
--
-- Postgres has no ALTER for a generated column's expression, so each column is
-- dropped and re-added (same pattern as 20260520100000_remove_rounding_from_generated_columns.sql).
-- Dropping/re-adding rewrites every existing row using the new expression, so
-- historical records are recalculated too.

ALTER TABLE commission_records DROP COLUMN unpaid;

ALTER TABLE commission_records DROP COLUMN ifa_amount;
ALTER TABLE commission_records ADD COLUMN ifa_amount NUMERIC(20,6) GENERATED ALWAYS AS ((amount + COALESCE(variable_amount, 0)) * ifa_percentage) STORED;

ALTER TABLE commission_records DROP COLUMN suspense_amount;
ALTER TABLE commission_records ADD COLUMN suspense_amount NUMERIC(20,6) GENERATED ALWAYS AS ((amount + COALESCE(variable_amount, 0)) * suspense_percentage) STORED;

ALTER TABLE commission_records DROP COLUMN wg_amount;
ALTER TABLE commission_records ADD COLUMN wg_amount NUMERIC(20,6) GENERATED ALWAYS AS ((amount + COALESCE(variable_amount, 0)) * wgi_percentage) STORED;

ALTER TABLE commission_records DROP COLUMN pending_amount;
ALTER TABLE commission_records ADD COLUMN pending_amount NUMERIC(20,6) GENERATED ALWAYS AS ((amount + COALESCE(variable_amount, 0)) * pending_percentage) STORED;

ALTER TABLE commission_records ADD COLUMN unpaid NUMERIC(20,6) GENERATED ALWAYS AS ((amount + COALESCE(variable_amount, 0)) * ifa_percentage - paid) STORED;
