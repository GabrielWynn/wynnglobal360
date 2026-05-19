-- Fix commission_records status check constraint to include 'advance' and 'reconciled'
-- The original constraint only allowed: pending, approved, paid, cancelled
ALTER TABLE commission_records DROP CONSTRAINT IF EXISTS commission_records_status_check;
ALTER TABLE commission_records ADD CONSTRAINT commission_records_status_check
  CHECK (status IN ('pending', 'approved', 'paid', 'cancelled', 'advance', 'reconciled'));
