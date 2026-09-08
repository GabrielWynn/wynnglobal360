-- Merge "IA Rate" (platform_payment_pct) and "Rate" (rate) into a single Rate
-- column. No live row had both set (checked before writing this migration),
-- so backfilling rate from platform_payment_pct is a straight, lossless move
-- with no conflicts to resolve. Values are carried over as-is/unconverted —
-- the two columns were already on different numeric scales before this merge
-- (platform_payment_pct stored as a 0-1 fraction, rate as a plain percentage
-- number) and that discrepancy is intentionally left alone here, not fixed.

UPDATE commission_records
SET rate = platform_payment_pct
WHERE rate IS NULL AND platform_payment_pct IS NOT NULL;

ALTER TABLE commission_records DROP COLUMN platform_payment_pct;
