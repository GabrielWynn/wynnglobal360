-- ============================================================
-- 20260505150000_commission_records_unification.sql
-- Canonical commission model tables and compatibility view.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ifa_id UUID NOT NULL REFERENCES ifas(id) ON DELETE RESTRICT,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  payment_reference TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'paid',
  created_by UUID REFERENCES ifas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_batches_ifa_id ON payment_batches(ifa_id);
CREATE INDEX IF NOT EXISTS idx_payment_batches_payment_date ON payment_batches(payment_date DESC);

CREATE TABLE IF NOT EXISTS commission_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_batch_id UUID REFERENCES csv_upload_batches(id) ON DELETE SET NULL,
  raw_data_id UUID REFERENCES raw_commission_data(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL,
  policy_number VARCHAR(100) NOT NULL,
  policy_holder_name TEXT,
  ifa_id UUID REFERENCES ifas(id) ON DELETE SET NULL,
  ifa_code VARCHAR(50),
  ifa_name TEXT,
  platform_id UUID REFERENCES platforms(id) ON DELETE SET NULL,
  commission_type VARCHAR(100),
  commission_type_code VARCHAR(100),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  platform_payment_pct NUMERIC(9,4),
  commencement_date DATE,
  ifa_percentage NUMERIC(9,4) NOT NULL DEFAULT 0,
  suspense_percentage NUMERIC(9,4) NOT NULL DEFAULT 0,
  wgi_percentage NUMERIC(9,4) NOT NULL DEFAULT 0,
  ifa_amount NUMERIC(14,2) GENERATED ALWAYS AS (ROUND((amount * ifa_percentage)::numeric, 2)) STORED,
  suspense_amount NUMERIC(14,2) GENERATED ALWAYS AS (ROUND((amount * suspense_percentage)::numeric, 2)) STORED,
  wg_amount NUMERIC(14,2) GENERATED ALWAYS AS (ROUND((amount * wgi_percentage)::numeric, 2)) STORED,
  paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  unpaid NUMERIC(14,2) GENERATED ALWAYS AS (ROUND((ifa_amount - paid)::numeric, 2)) STORED,
  rate NUMERIC(12,6),
  ape NUMERIC(14,2),
  ape_wgi NUMERIC(14,2),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  is_advance BOOLEAN NOT NULL DEFAULT FALSE,
  linked_record_id UUID REFERENCES commission_records(id) ON DELETE SET NULL,
  reconciled_at TIMESTAMPTZ,
  payment_batch_id UUID REFERENCES payment_batches(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  ifa_notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES ifas(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_records_status ON commission_records(status);
CREATE INDEX IF NOT EXISTS idx_commission_records_ifa_code ON commission_records(ifa_code);
CREATE INDEX IF NOT EXISTS idx_commission_records_policy_number ON commission_records(policy_number);
CREATE INDEX IF NOT EXISTS idx_commission_records_transaction_date ON commission_records(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_commission_records_payment_batch_id ON commission_records(payment_batch_id);

CREATE TABLE IF NOT EXISTS manual_policy_mappings (
  policy_number VARCHAR(100) PRIMARY KEY,
  ifa_id UUID NOT NULL REFERENCES ifas(id) ON DELETE RESTRICT,
  ifa_code VARCHAR(50) NOT NULL,
  ifa_name TEXT,
  created_by UUID REFERENCES ifas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_policy_mappings_ifa_code ON manual_policy_mappings(ifa_code);

CREATE TABLE IF NOT EXISTS kpi_config (
  key VARCHAR(120) PRIMARY KEY,
  value TEXT NOT NULL,
  label TEXT,
  description TEXT,
  category VARCHAR(80) NOT NULL DEFAULT 'general',
  updated_by UUID REFERENCES ifas(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO kpi_config (key, value, label, description, category)
VALUES
  ('alert_email_recipients', '', 'Alert Recipients', 'Comma-separated list of recipients for KPI alerts', 'alerts'),
  ('overdue_days_threshold', '30', 'Overdue Days Threshold', 'Days before approved records are considered overdue', 'thresholds'),
  ('overpayment_tolerance', '0.01', 'Overpayment Tolerance', 'Tolerance for paid > ifa_amount checks', 'thresholds')
ON CONFLICT (key) DO NOTHING;

-- Compatibility layer: keep legacy readers working while the codebase
-- is standardized on admin_audit_log.
CREATE OR REPLACE VIEW audit_log AS
SELECT
  id,
  action,
  target_id AS record_id,
  actor_id AS changed_by,
  actor_email AS user_email,
  before_data AS old_value,
  after_data AS new_value,
  after_data ->> 'override_reason' AS override_reason,
  after_data ->> 'table_name' AS table_name,
  COALESCE(after_data ->> 'policy_number', before_data ->> 'policy_number') AS policy_number,
  created_at AS performed_at,
  created_at
FROM admin_audit_log;
