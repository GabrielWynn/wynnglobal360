-- Remove ROUND() from all generated amount columns so values are stored exactly.
-- amount is NUMERIC(14,2) and *_percentage is NUMERIC(9,4), so their product
-- has at most 6 decimal places — always exact, no rounding needed.
-- Note: unpaid cannot reference ifa_amount (generated→generated is forbidden),
-- so its formula inlines amount * ifa_percentage directly.

ALTER TABLE commission_records DROP COLUMN unpaid;

ALTER TABLE commission_records DROP COLUMN ifa_amount;
ALTER TABLE commission_records ADD COLUMN ifa_amount NUMERIC(20,6) GENERATED ALWAYS AS (amount * ifa_percentage) STORED;

ALTER TABLE commission_records DROP COLUMN suspense_amount;
ALTER TABLE commission_records ADD COLUMN suspense_amount NUMERIC(20,6) GENERATED ALWAYS AS (amount * suspense_percentage) STORED;

ALTER TABLE commission_records DROP COLUMN wg_amount;
ALTER TABLE commission_records ADD COLUMN wg_amount NUMERIC(20,6) GENERATED ALWAYS AS (amount * wgi_percentage) STORED;

ALTER TABLE commission_records DROP COLUMN pending_amount;
ALTER TABLE commission_records ADD COLUMN pending_amount NUMERIC(20,6) GENERATED ALWAYS AS (amount * pending_percentage) STORED;

ALTER TABLE commission_records ADD COLUMN unpaid NUMERIC(20,6) GENERATED ALWAYS AS ((amount * ifa_percentage) - paid) STORED;
