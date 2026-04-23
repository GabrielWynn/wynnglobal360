-- ============================================================
-- 000_base_schema.sql
-- Wynn Global 360 — Base Schema
-- Run this FIRST on a blank Supabase project
-- BEFORE running migrations 001 through 031
-- ============================================================
-- Generated from old Commission app Supabase project
-- Tables: 10 base tables + enums + extensions
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM (
    'calculated',
    'pending',
    'approved',
    'paid',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE currency_type AS ENUM (
    'USD',
    'GBP',
    'EUR',
    'AED',
    'SGD'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE calculation_method AS ENUM (
    'percentage_of_investment',
    'flat_fee',
    'percentage_of_commission',
    'tiered'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE upload_status AS ENUM (
    'processing',
    'completed',
    'failed',
    'partial'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLE: schema_version
-- Tracks schema changes
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_version (
  version        VARCHAR(10)               NOT NULL,
  applied_at     TIMESTAMP WITH TIME ZONE  DEFAULT NOW()
);

-- ============================================================
-- TABLE: platforms
-- Insurance/investment platforms (RL360, Hansard, Utmost etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS platforms (
  id               UUID          NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  code             VARCHAR(50)   NOT NULL UNIQUE,
  name             VARCHAR(255)  NOT NULL,
  csv_format_config JSONB        DEFAULT NULL,
  is_active        BOOLEAN       DEFAULT TRUE,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLE: ifas
-- Advisors / users of the system
-- ============================================================

CREATE TABLE IF NOT EXISTS ifas (
  id                  UUID          NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  code                VARCHAR(100)  NOT NULL,
  name                VARCHAR(255)  NOT NULL,
  email               VARCHAR(255)  NOT NULL UNIQUE,
  country             VARCHAR(100)  DEFAULT NULL,
  status              VARCHAR(20)   DEFAULT 'active',
  payment_threshold   NUMERIC       DEFAULT 500.00,
  show_negative_balance BOOLEAN     DEFAULT FALSE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  role                VARCHAR(20)   DEFAULT 'ifa',
  user_id             UUID          DEFAULT NULL,
  advisor_notes       TEXT          DEFAULT NULL
);

-- Index for fast user_id lookups (used by auth)
CREATE INDEX IF NOT EXISTS idx_ifas_user_id ON ifas(user_id);
CREATE INDEX IF NOT EXISTS idx_ifas_email ON ifas(email);
CREATE INDEX IF NOT EXISTS idx_ifas_role ON ifas(role);
CREATE INDEX IF NOT EXISTS idx_ifas_status ON ifas(status);

-- ============================================================
-- TABLE: ifa_balances
-- Running balance totals per IFA
-- ============================================================

CREATE TABLE IF NOT EXISTS ifa_balances (
  ifa_id              UUID     NOT NULL PRIMARY KEY REFERENCES ifas(id) ON DELETE CASCADE,
  current_balance     NUMERIC  DEFAULT 0,
  suspended_balance   NUMERIC  DEFAULT 0,
  negative_balance    NUMERIC  DEFAULT 0,
  total_earned        NUMERIC  DEFAULT 0,
  total_paid          NUMERIC  DEFAULT 0,
  last_payment_date   DATE     DEFAULT NULL,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLE: commission_types
-- Types of commission (initial, renewal, trail etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS commission_types (
  id          UUID          NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  code        VARCHAR(50)   NOT NULL UNIQUE,
  name        VARCHAR(255)  NOT NULL,
  description TEXT          DEFAULT NULL,
  is_active   BOOLEAN       DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLE: payment_matrix_rules
-- Commission calculation rules per platform/IFA/type
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_matrix_rules (
  id                      UUID                NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  rule_name               VARCHAR(255)        DEFAULT NULL,
  platform_id             UUID                DEFAULT NULL REFERENCES platforms(id),
  ifa_id                  UUID                DEFAULT NULL REFERENCES ifas(id),
  commission_type_id      UUID                DEFAULT NULL REFERENCES commission_types(id),
  product_type            VARCHAR(100)        DEFAULT NULL,
  effective_start_date    DATE                NOT NULL,
  effective_end_date      DATE                DEFAULT NULL,
  calculation_method      calculation_method  DEFAULT 'percentage_of_investment',
  ifa_rate                NUMERIC             DEFAULT NULL,
  company_rate            NUMERIC             DEFAULT NULL,
  suspense_rate           NUMERIC             DEFAULT NULL,
  has_establishment_periods BOOLEAN           DEFAULT FALSE,
  establishment_config    JSONB               DEFAULT NULL,
  notes                   TEXT                DEFAULT NULL,
  created_by              UUID                DEFAULT NULL,
  is_active               BOOLEAN             DEFAULT TRUE,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  commission_type_code    TEXT                DEFAULT NULL
);

-- ============================================================
-- TABLE: policies
-- Insurance policies linked to IFAs
-- ============================================================

CREATE TABLE IF NOT EXISTS policies (
  id                  UUID          NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  policy_number       VARCHAR(100)  NOT NULL,
  ifa_id              UUID          DEFAULT NULL REFERENCES ifas(id),
  platform_id         UUID          DEFAULT NULL REFERENCES platforms(id),
  policy_holder_name  VARCHAR(255)  DEFAULT NULL,
  product_type        VARCHAR(100)  DEFAULT NULL,
  currency            currency_type DEFAULT 'USD',
  commencement_date   DATE          DEFAULT NULL,
  status              VARCHAR(20)   DEFAULT 'active',
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policies_policy_number ON policies(policy_number);
CREATE INDEX IF NOT EXISTS idx_policies_ifa_id ON policies(ifa_id);

-- ============================================================
-- TABLE: csv_upload_batches
-- Tracks CSV file uploads from platforms
-- ============================================================

CREATE TABLE IF NOT EXISTS csv_upload_batches (
  id                  UUID            NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  platform_id         UUID            DEFAULT NULL REFERENCES platforms(id),
  filename            VARCHAR(255)    NOT NULL,
  upload_date         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by         UUID            DEFAULT NULL,
  total_rows          INTEGER         DEFAULT NULL,
  processed_rows      INTEGER         DEFAULT 0,
  mapped_rows         INTEGER         DEFAULT 0,
  unmapped_rows       INTEGER         DEFAULT 0,
  error_rows          INTEGER         DEFAULT 0,
  status              upload_status   DEFAULT 'processing',
  file_url            TEXT            DEFAULT NULL,
  processing_errors   JSONB           DEFAULT NULL,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by_email   TEXT            DEFAULT NULL
);

-- ============================================================
-- TABLE: raw_commission_data
-- Raw rows imported from platform CSV files
-- ============================================================

CREATE TABLE IF NOT EXISTS raw_commission_data (
  id                    UUID          NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  upload_batch_id       UUID          DEFAULT NULL REFERENCES csv_upload_batches(id),
  platform_id           UUID          DEFAULT NULL REFERENCES platforms(id),
  policy_number         VARCHAR(100)  DEFAULT NULL,
  transaction_date      DATE          DEFAULT NULL,
  commission_type_code  VARCHAR(255)  DEFAULT NULL,
  gross_amount          NUMERIC       DEFAULT NULL,
  commission_rate       NUMERIC       DEFAULT NULL,
  calculated_commission NUMERIC       DEFAULT NULL,
  currency              currency_type DEFAULT 'USD',
  raw_data              JSONB         DEFAULT NULL,
  mapping_status        VARCHAR(20)   DEFAULT 'pending',
  error_message         TEXT          DEFAULT NULL,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_commission_data_policy_number 
  ON raw_commission_data(policy_number);
CREATE INDEX IF NOT EXISTS idx_raw_commission_data_upload_batch_id 
  ON raw_commission_data(upload_batch_id);

-- ============================================================
-- TABLE: unmapped_policies
-- Policies from CSV that could not be matched to an IFA
-- ============================================================

CREATE TABLE IF NOT EXISTS unmapped_policies (
  id                  UUID          NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  raw_data_id         UUID          DEFAULT NULL REFERENCES raw_commission_data(id),
  policy_number       VARCHAR(100)  NOT NULL,
  platform_id         UUID          DEFAULT NULL REFERENCES platforms(id),
  policy_holder_name  VARCHAR(255)  DEFAULT NULL,
  suggested_ifa_id    UUID          DEFAULT NULL REFERENCES ifas(id),
  status              VARCHAR(20)   DEFAULT 'pending',
  resolved_by         UUID          DEFAULT NULL,
  resolved_at         TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLE: commission_transactions
-- Legacy transaction table (older schema, kept for reference)
-- ============================================================

CREATE TABLE IF NOT EXISTS commission_transactions (
  id                          UUID                NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  raw_data_id                 UUID                DEFAULT NULL REFERENCES raw_commission_data(id),
  policy_id                   UUID                DEFAULT NULL REFERENCES policies(id),
  ifa_id                      UUID                DEFAULT NULL REFERENCES ifas(id),
  platform_id                 UUID                DEFAULT NULL REFERENCES platforms(id),
  commission_type_id          UUID                DEFAULT NULL REFERENCES commission_types(id),
  transaction_date            DATE                NOT NULL,
  policy_number               VARCHAR(100)        DEFAULT NULL,
  policy_holder_name          VARCHAR(255)        DEFAULT NULL,
  investment_amount           NUMERIC             DEFAULT NULL,
  commission_rate             NUMERIC             DEFAULT NULL,
  gross_commission            NUMERIC             DEFAULT NULL,
  ifa_percentage              NUMERIC             DEFAULT NULL,
  ifa_amount                  NUMERIC             DEFAULT NULL,
  suspense_percentage         NUMERIC             DEFAULT NULL,
  suspense_amount             NUMERIC             DEFAULT NULL,
  company_percentage          NUMERIC             DEFAULT NULL,
  company_amount              NUMERIC             DEFAULT NULL,
  has_establishment_period    BOOLEAN             DEFAULT FALSE,
  establishment_payment_number INTEGER            DEFAULT NULL,
  establishment_release_date  DATE                DEFAULT NULL,
  parent_transaction_id       UUID                DEFAULT NULL 
                              REFERENCES commission_transactions(id),
  status                      transaction_status  DEFAULT 'calculated',
  approved_by                 UUID                DEFAULT NULL,
  approved_at                 TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  payment_batch_id            UUID                DEFAULT NULL,
  paid_date                   DATE                DEFAULT NULL,
  manual_adjustment           NUMERIC             DEFAULT 0,
  adjustment_reason           TEXT                DEFAULT NULL,
  calculation_rule_id         UUID                DEFAULT NULL 
                              REFERENCES payment_matrix_rules(id),
  currency                    currency_type       DEFAULT 'USD',
  notes                       TEXT                DEFAULT NULL,
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_transactions_ifa_id 
  ON commission_transactions(ifa_id);
CREATE INDEX IF NOT EXISTS idx_commission_transactions_status 
  ON commission_transactions(status);

-- ============================================================
-- SEED: Insert initial schema version
-- ============================================================

INSERT INTO schema_version (version, applied_at)
VALUES ('0.0.0', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- VERIFY: Show all tables created
-- ============================================================

SELECT 
  table_name,
  (
    SELECT COUNT(*) 
    FROM information_schema.columns c 
    WHERE c.table_name = t.table_name 
    AND c.table_schema = 'public'
  ) AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
ORDER BY table_name;
