-- =============================================================================
-- Financial Planner – Fact Find Module
-- Migration: 20260528000000_financial_planner_fact_find
-- =============================================================================

-- ---------------------------------------------------------------------------
-- CMS: Form Versions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fp_form_versions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name  TEXT        NOT NULL,
  version_number INT        NOT NULL DEFAULT 1,
  is_active     BOOLEAN     NOT NULL DEFAULT FALSE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fp_form_versions_active ON fp_form_versions(is_active);

-- ---------------------------------------------------------------------------
-- CMS: Sections within a form version
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fp_sections (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_version_id UUID        NOT NULL REFERENCES fp_form_versions(id) ON DELETE CASCADE,
  key             TEXT        NOT NULL,
  label_en        TEXT        NOT NULL,
  label_es        TEXT        NOT NULL,
  order_index     INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_version_id, key)
);

CREATE INDEX idx_fp_sections_version ON fp_sections(form_version_id, order_index);

-- ---------------------------------------------------------------------------
-- CMS: Fields within a section
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fp_fields (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      UUID        NOT NULL REFERENCES fp_sections(id) ON DELETE CASCADE,
  key             TEXT        NOT NULL,
  label_en        TEXT        NOT NULL,
  label_es        TEXT        NOT NULL,
  field_type      TEXT        NOT NULL CHECK (field_type IN (
                    'text', 'number', 'date', 'currency', 'select',
                    'multiselect', 'boolean', 'textarea', 'repeating_group', 'computed'
                  )),
  is_required     BOOLEAN     NOT NULL DEFAULT FALSE,
  options         JSONB,
  placeholder_en  TEXT,
  placeholder_es  TEXT,
  help_text_en    TEXT,
  help_text_es    TEXT,
  order_index     INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (section_id, key)
);

CREATE INDEX idx_fp_fields_section ON fp_fields(section_id, order_index);

-- ---------------------------------------------------------------------------
-- Clients – belong to an IFA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fp_clients (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ifa_id        UUID        NOT NULL REFERENCES ifas(id) ON DELETE RESTRICT,
  first_name    TEXT        NOT NULL,
  last_name     TEXT        NOT NULL,
  email         TEXT,
  phone         TEXT,
  date_of_birth DATE,
  nationality   TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fp_clients_ifa ON fp_clients(ifa_id);

-- ---------------------------------------------------------------------------
-- Fact Finds – one session per client per IFA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fp_fact_finds (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              UUID        NOT NULL REFERENCES fp_clients(id) ON DELETE RESTRICT,
  ifa_id                 UUID        NOT NULL REFERENCES ifas(id) ON DELETE RESTRICT,
  form_version_id        UUID        NOT NULL REFERENCES fp_form_versions(id) ON DELETE RESTRICT,
  language               TEXT        NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es')),
  current_section_index  INT         NOT NULL DEFAULT 0,
  completed_section_keys JSONB       NOT NULL DEFAULT '[]',
  status                 TEXT        NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  submitted_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fp_fact_finds_ifa    ON fp_fact_finds(ifa_id);
CREATE INDEX idx_fp_fact_finds_client ON fp_fact_finds(client_id);
CREATE INDEX idx_fp_fact_finds_status ON fp_fact_finds(status);

-- ---------------------------------------------------------------------------
-- Answers – one row per field per fact find (stable field_key)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fp_answers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_find_id  UUID        NOT NULL REFERENCES fp_fact_finds(id) ON DELETE CASCADE,
  field_key     TEXT        NOT NULL,
  value_text    TEXT,
  value_number  NUMERIC,
  value_date    DATE,
  value_boolean BOOLEAN,
  value_json    JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fact_find_id, field_key)
);

CREATE INDEX idx_fp_answers_fact_find ON fp_answers(fact_find_id);
CREATE INDEX idx_fp_answers_field_key ON fp_answers(field_key);

-- ---------------------------------------------------------------------------
-- Notes – admin notes/flags per fact find
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fp_notes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_find_id  UUID        NOT NULL REFERENCES fp_fact_finds(id) ON DELETE CASCADE,
  author_id     UUID        NOT NULL REFERENCES ifas(id) ON DELETE RESTRICT,
  content       TEXT        NOT NULL,
  is_flagged    BOOLEAN     NOT NULL DEFAULT FALSE,
  is_resolved   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fp_notes_fact_find ON fp_notes(fact_find_id);

-- ---------------------------------------------------------------------------
-- Document Automation (Phase 2 schema – no UI yet)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fp_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  description     TEXT,
  field_mapping   JSONB,
  file_url        TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_generated_documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES fp_clients(id) ON DELETE RESTRICT,
  fact_find_id    UUID        REFERENCES fp_fact_finds(id) ON DELETE SET NULL,
  template_id     UUID        REFERENCES fp_templates(id) ON DELETE SET NULL,
  file_url        TEXT,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by    UUID        REFERENCES ifas(id) ON DELETE SET NULL
);

CREATE INDEX idx_fp_gen_docs_client ON fp_generated_documents(client_id);

-- ---------------------------------------------------------------------------
-- Phase 2: Retirement Projection Scenarios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fp_retirement_scenarios (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_find_id  UUID        NOT NULL REFERENCES fp_fact_finds(id) ON DELETE CASCADE,
  client_id     UUID        NOT NULL REFERENCES fp_clients(id) ON DELETE CASCADE,
  scenario_name TEXT        NOT NULL DEFAULT 'Base Case',
  parameters    JSONB,
  results       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fp_retirement_fact_find ON fp_retirement_scenarios(fact_find_id);

-- ---------------------------------------------------------------------------
-- Phase 2: Cashflow Entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fp_cashflow_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_find_id  UUID        NOT NULL REFERENCES fp_fact_finds(id) ON DELETE CASCADE,
  client_id     UUID        NOT NULL REFERENCES fp_clients(id) ON DELETE CASCADE,
  entry_type    TEXT        NOT NULL CHECK (entry_type IN ('income', 'expense')),
  category      TEXT        NOT NULL,
  amount        NUMERIC     NOT NULL,
  currency      TEXT        NOT NULL DEFAULT 'USD',
  frequency     TEXT        NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly','monthly','quarterly','annual','one_off')),
  start_date    DATE,
  end_date      DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fp_cashflow_fact_find ON fp_cashflow_entries(fact_find_id);

-- ---------------------------------------------------------------------------
-- Phase 2: Calculator Results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fp_calculator_results (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_find_id     UUID        NOT NULL REFERENCES fp_fact_finds(id) ON DELETE CASCADE,
  client_id        UUID        NOT NULL REFERENCES fp_clients(id) ON DELETE CASCADE,
  calculator_type  TEXT        NOT NULL,
  input_data       JSONB,
  result_data      JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fp_calculator_fact_find ON fp_calculator_results(fact_find_id);

-- ---------------------------------------------------------------------------
-- Auto-update triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fp_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fp_form_versions','fp_sections','fp_fields','fp_clients',
    'fp_fact_finds','fp_answers','fp_notes','fp_templates',
    'fp_generated_documents','fp_retirement_scenarios',
    'fp_cashflow_entries'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at
       BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION fp_set_updated_at()', t
    );
  END LOOP;
END $$;

-- =============================================================================
-- SEED: Initial form version — Análisis Financiero Confidencial v1
-- =============================================================================
DO $$
DECLARE
  v_ver   UUID := gen_random_uuid();

  -- Section IDs
  s_pi    UUID := gen_random_uuid(); -- personal_information
  s_ei    UUID := gen_random_uuid(); -- employment_information
  s_se    UUID := gen_random_uuid(); -- spouse_employment
  s_pr    UUID := gen_random_uuid(); -- properties
  s_sa    UUID := gen_random_uuid(); -- savings
  s_lo    UUID := gen_random_uuid(); -- loans_credit_cards
  s_in    UUID := gen_random_uuid(); -- investments
  s_ad    UUID := gen_random_uuid(); -- academic_development_fund
  s_pp    UUID := gen_random_uuid(); -- private_pension
  s_gp    UUID := gen_random_uuid(); -- government_pension
  s_rg    UUID := gen_random_uuid(); -- retirement_goals
  s_mt    UUID := gen_random_uuid(); -- medium_term_goals
  s_ins   UUID := gen_random_uuid(); -- insurance
  s_rt    UUID := gen_random_uuid(); -- risk_tolerance
  s_ab    UUID := gen_random_uuid(); -- available_budget
  s_cp    UUID := gen_random_uuid(); -- client_product_characteristics
  s_an    UUID := gen_random_uuid(); -- additional_notes
BEGIN

-- ── Form Version ─────────────────────────────────────────────────────────────
INSERT INTO fp_form_versions (id, version_name, version_number, is_active, notes)
VALUES (v_ver, 'Análisis Financiero Confidencial', 1, TRUE,
        'Initial version based on Wynn Global confidential financial analysis form');

-- ── Sections ─────────────────────────────────────────────────────────────────
INSERT INTO fp_sections (id, form_version_id, key, label_en, label_es, order_index) VALUES
  (s_pi,  v_ver, 'personal_information',           'Personal Information',                'Información Personal',                          0),
  (s_ei,  v_ver, 'employment_information',          'Employment Information',               'Información Laboral',                            1),
  (s_se,  v_ver, 'spouse_employment',               'Spouse / Partner Employment',          'Información Laboral del Cónyuge / Pareja',        2),
  (s_pr,  v_ver, 'properties',                      'Properties',                           'Propiedades',                                    3),
  (s_sa,  v_ver, 'savings',                         'Savings',                              'Ahorros',                                        4),
  (s_lo,  v_ver, 'loans_credit_cards',              'Loans and Credit Cards',               'Préstamos y Tarjetas de Crédito',                 5),
  (s_in,  v_ver, 'investments',                     'Investments',                          'Inversiones',                                    6),
  (s_ad,  v_ver, 'academic_development_fund',       'Academic Development Fund',            'Fondo de Desarrollo Académico',                  7),
  (s_pp,  v_ver, 'private_pension',                 'Private Pension and Savings Plan',     'Pensión Privada y Plan de Ahorro',                8),
  (s_gp,  v_ver, 'government_pension',              'Government Pension',                   'Pensión del Gobierno',                           9),
  (s_rg,  v_ver, 'retirement_goals',                'Retirement and Jubilation Goals',      'Metas de Jubilación y Retiro',                   10),
  (s_mt,  v_ver, 'medium_term_goals',               'Medium-term Goals',                    'Metas a Mediano Plazo',                          11),
  (s_ins, v_ver, 'insurance',                       'Insurance',                            'Seguros',                                        12),
  (s_rt,  v_ver, 'risk_tolerance',                  'Risk Tolerance Questionnaire',         'Cuestionario de Tolerancia al Riesgo',           13),
  (s_ab,  v_ver, 'available_budget',                'Available Budget for Savings',         'Presupuesto Disponible para Ahorro',             14),
  (s_cp,  v_ver, 'client_product_characteristics',  'Client Required Product Characteristics', 'Características Requeridas del Producto por el Cliente', 15),
  (s_an,  v_ver, 'additional_notes',                'Additional Notes and References',      'Notas Adicionales y Referencias',                16);

-- ============================================================================
-- SECTION 1: Personal Information
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, placeholder_en, placeholder_es) VALUES
  (s_pi, 'pi_full_name',       'Full Name',            'Nombre Completo',       'text',   TRUE,  0, 'First and last name', 'Nombre y apellidos'),
  (s_pi, 'pi_date_of_birth',   'Date of Birth',        'Fecha de Nacimiento',   'date',   TRUE,  1, NULL, NULL),
  (s_pi, 'pi_nationality',     'Nationality',          'Nacionalidad',          'text',   TRUE,  2, 'e.g. Panamanian', 'p. ej. Panameño'),
  (s_pi, 'pi_passport_id',     'Passport / ID Number', 'Pasaporte / Cédula',   'text',   FALSE, 3, NULL, NULL),
  (s_pi, 'pi_phone',           'Phone Number',         'Número de Teléfono',    'text',   TRUE,  4, '+1 000 000 0000', '+1 000 000 0000'),
  (s_pi, 'pi_email',           'Email Address',        'Correo Electrónico',    'text',   TRUE,  5, 'email@example.com', 'correo@ejemplo.com'),
  (s_pi, 'pi_address',         'Residential Address',  'Dirección Residencial', 'textarea', FALSE, 6, 'Street, number, city', 'Calle, número, ciudad'),
  (s_pi, 'pi_country',         'Country of Residence', 'País de Residencia',   'text',   TRUE,  7, NULL, NULL),
  (s_pi, 'pi_number_of_dependents', 'Number of Dependents', 'Número de Dependientes', 'number', FALSE, 8, '0', '0');

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options) VALUES
  (s_pi, 'pi_marital_status', 'Marital Status', 'Estado Civil', 'select', TRUE, 9,
   '[{"value":"single","label_en":"Single","label_es":"Soltero/a"},
     {"value":"married","label_en":"Married","label_es":"Casado/a"},
     {"value":"civil_union","label_en":"Civil Union","label_es":"Unión Civil"},
     {"value":"divorced","label_en":"Divorced","label_es":"Divorciado/a"},
     {"value":"widowed","label_en":"Widowed","label_es":"Viudo/a"},
     {"value":"other","label_en":"Other","label_es":"Otro"}]'::jsonb
  );

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options, help_text_en, help_text_es) VALUES
  (s_pi, 'pi_children', 'Children / Dependents', 'Hijos / Dependientes', 'repeating_group', FALSE, 10,
   '[{"key":"name","label_en":"Full Name","label_es":"Nombre Completo","type":"text","required":true},
     {"key":"date_of_birth","label_en":"Date of Birth","label_es":"Fecha de Nacimiento","type":"date","required":false},
     {"key":"relationship","label_en":"Relationship","label_es":"Relación","type":"select","required":false,
      "options":[{"value":"child","label_en":"Child","label_es":"Hijo/a"},
                 {"value":"dependent","label_en":"Dependent","label_es":"Dependiente"},
                 {"value":"other","label_en":"Other","label_es":"Otro"}]}]'::jsonb,
   'Add each child or financial dependent', 'Agregue cada hijo/a o dependiente financiero');

-- ============================================================================
-- SECTION 2: Employment Information
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options) VALUES
  (s_ei, 'ei_employment_type', 'Employment Type', 'Tipo de Empleo', 'select', TRUE, 0,
   '[{"value":"employed","label_en":"Employed","label_es":"Empleado"},
     {"value":"self_employed","label_en":"Self-employed","label_es":"Trabajador independiente"},
     {"value":"business_owner","label_en":"Business Owner","label_es":"Empresario"},
     {"value":"retired","label_en":"Retired","label_es":"Jubilado"},
     {"value":"unemployed","label_en":"Unemployed","label_es":"Desempleado"},
     {"value":"student","label_en":"Student","label_es":"Estudiante"}]'::jsonb
  );

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, placeholder_en, placeholder_es) VALUES
  (s_ei, 'ei_employer_name',      'Employer / Company Name', 'Empleador / Empresa',      'text',     FALSE, 1, NULL, NULL),
  (s_ei, 'ei_job_title',          'Job Title / Position',    'Cargo / Puesto',            'text',     FALSE, 2, NULL, NULL),
  (s_ei, 'ei_years_employed',     'Years with Employer',     'Años con el Empleador',     'number',   FALSE, 3, '0', '0'),
  (s_ei, 'ei_annual_income',      'Annual Income',           'Ingreso Anual',             'currency', TRUE,  4, NULL, NULL),
  (s_ei, 'ei_other_income',       'Other Income (annual)',   'Otros Ingresos (anual)',    'currency', FALSE, 5, NULL, NULL),
  (s_ei, 'ei_other_income_notes', 'Other Income Description','Descripción Otros Ingresos','textarea', FALSE, 6, NULL, NULL);

-- ============================================================================
-- SECTION 3: Spouse / Partner Employment
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index) VALUES
  (s_se, 'se_has_spouse', 'Does client have a spouse or partner?', '¿El cliente tiene cónyuge o pareja?', 'boolean', TRUE, 0);

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, placeholder_en, placeholder_es) VALUES
  (s_se, 'se_spouse_name',        'Spouse / Partner Full Name', 'Nombre Completo del Cónyuge',         'text',     FALSE, 1, NULL, NULL),
  (s_se, 'se_spouse_employer',    'Employer / Company',         'Empleador / Empresa',                 'text',     FALSE, 2, NULL, NULL),
  (s_se, 'se_spouse_job_title',   'Job Title / Position',       'Cargo / Puesto',                      'text',     FALSE, 3, NULL, NULL),
  (s_se, 'se_spouse_annual_income','Annual Income',              'Ingreso Anual',                       'currency', FALSE, 5, NULL, NULL);

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options) VALUES
  (s_se, 'se_spouse_employment_type', 'Employment Type', 'Tipo de Empleo', 'select', FALSE, 4,
   '[{"value":"employed","label_en":"Employed","label_es":"Empleado"},
     {"value":"self_employed","label_en":"Self-employed","label_es":"Trabajador independiente"},
     {"value":"business_owner","label_en":"Business Owner","label_es":"Empresario"},
     {"value":"retired","label_en":"Retired","label_es":"Jubilado"},
     {"value":"unemployed","label_en":"Unemployed","label_es":"Desempleado"},
     {"value":"homemaker","label_en":"Homemaker","label_es":"Ama/Amo de casa"}]'::jsonb
  );

-- ============================================================================
-- SECTION 4: Properties
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options) VALUES
  (s_pr, 'pr_residential_status', 'Primary Residential Status', 'Estado de Residencia Principal', 'select', TRUE, 0,
   '[{"value":"own_outright","label_en":"Own outright (no mortgage)","label_es":"Propietario sin hipoteca"},
     {"value":"own_mortgage","label_en":"Own with mortgage","label_es":"Propietario con hipoteca"},
     {"value":"renting","label_en":"Renting","label_es":"Arrendatario"},
     {"value":"family","label_en":"Living with family","label_es":"Viviendo con familia"},
     {"value":"other","label_en":"Other","label_es":"Otro"}]'::jsonb
  );

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index) VALUES
  (s_pr, 'pr_primary_value',    'Primary Residence Value',    'Valor de la Residencia Principal', 'currency', FALSE, 1),
  (s_pr, 'pr_primary_mortgage', 'Outstanding Mortgage',       'Hipoteca Pendiente',               'currency', FALSE, 2),
  (s_pr, 'pr_monthly_payment',  'Monthly Mortgage / Rent',    'Cuota Mensual Hipoteca / Alquiler','currency', FALSE, 3);

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options, help_text_en, help_text_es) VALUES
  (s_pr, 'pr_additional_properties', 'Additional Properties', 'Propiedades Adicionales', 'repeating_group', FALSE, 4,
   '[{"key":"property_type","label_en":"Property Type","label_es":"Tipo de Propiedad","type":"select","required":false,
      "options":[{"value":"residential","label_en":"Residential","label_es":"Residencial"},
                 {"value":"commercial","label_en":"Commercial","label_es":"Comercial"},
                 {"value":"land","label_en":"Land","label_es":"Terreno"},
                 {"value":"other","label_en":"Other","label_es":"Otro"}]},
    {"key":"location","label_en":"Location / Address","label_es":"Ubicación / Dirección","type":"text","required":false},
    {"key":"current_value","label_en":"Estimated Value","label_es":"Valor Estimado","type":"number","required":false},
    {"key":"currency","label_en":"Currency","label_es":"Moneda","type":"select","required":false,
     "options":[{"value":"USD","label_en":"USD","label_es":"USD"},{"value":"GBP","label_en":"GBP","label_es":"GBP"},
                {"value":"EUR","label_en":"EUR","label_es":"EUR"},{"value":"AED","label_en":"AED","label_es":"AED"}]},
    {"key":"mortgage_outstanding","label_en":"Mortgage Outstanding","label_es":"Hipoteca Pendiente","type":"number","required":false},
    {"key":"monthly_rental_income","label_en":"Monthly Rental Income","label_es":"Ingreso Mensual por Alquiler","type":"number","required":false}]'::jsonb,
   'Add any investment or secondary properties', 'Agregue propiedades de inversión o secundarias');

-- ============================================================================
-- SECTION 5: Savings
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options, help_text_en, help_text_es) VALUES
  (s_sa, 'sa_savings_accounts', 'Savings Accounts', 'Cuentas de Ahorro', 'repeating_group', FALSE, 0,
   '[{"key":"institution","label_en":"Bank / Institution","label_es":"Banco / Institución","type":"text","required":true},
     {"key":"account_type","label_en":"Account Type","label_es":"Tipo de Cuenta","type":"select","required":false,
      "options":[{"value":"savings","label_en":"Savings","label_es":"Ahorro"},
                 {"value":"checking","label_en":"Checking","label_es":"Corriente"},
                 {"value":"fixed_term","label_en":"Fixed-term Deposit","label_es":"Depósito a Plazo Fijo"},
                 {"value":"money_market","label_en":"Money Market","label_es":"Mercado Monetario"},
                 {"value":"other","label_en":"Other","label_es":"Otro"}]},
     {"key":"balance","label_en":"Current Balance","label_es":"Saldo Actual","type":"number","required":false},
     {"key":"currency","label_en":"Currency","label_es":"Moneda","type":"select","required":false,
      "options":[{"value":"USD","label_en":"USD","label_es":"USD"},{"value":"GBP","label_en":"GBP","label_es":"GBP"},
                 {"value":"EUR","label_en":"EUR","label_es":"EUR"},{"value":"AED","label_en":"AED","label_es":"AED"},
                 {"value":"PAB","label_en":"PAB (Balboa)","label_es":"PAB (Balboa)"}]}]'::jsonb,
   'Add all savings and deposit accounts', 'Agregue todas las cuentas de ahorro y depósito');

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index) VALUES
  (s_sa, 'sa_emergency_fund',        'Total Emergency Fund',      'Fondo de Emergencia Total',    'currency', FALSE, 1),
  (s_sa, 'sa_emergency_fund_months', 'Months of Expenses Covered','Meses de Gastos Cubiertos',    'number',   FALSE, 2);

-- ============================================================================
-- SECTION 6: Loans and Credit Cards
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options, help_text_en, help_text_es) VALUES
  (s_lo, 'lo_loans', 'Loans', 'Préstamos', 'repeating_group', FALSE, 0,
   '[{"key":"lender","label_en":"Lender / Bank","label_es":"Prestamista / Banco","type":"text","required":true},
     {"key":"loan_type","label_en":"Loan Type","label_es":"Tipo de Préstamo","type":"select","required":false,
      "options":[{"value":"personal","label_en":"Personal Loan","label_es":"Préstamo Personal"},
                 {"value":"auto","label_en":"Auto Loan","label_es":"Préstamo de Auto"},
                 {"value":"student","label_en":"Student Loan","label_es":"Préstamo Estudiantil"},
                 {"value":"mortgage","label_en":"Mortgage","label_es":"Hipoteca"},
                 {"value":"business","label_en":"Business Loan","label_es":"Préstamo Empresarial"},
                 {"value":"other","label_en":"Other","label_es":"Otro"}]},
     {"key":"outstanding_balance","label_en":"Outstanding Balance","label_es":"Saldo Pendiente","type":"number","required":false},
     {"key":"monthly_payment","label_en":"Monthly Payment","label_es":"Cuota Mensual","type":"number","required":false},
     {"key":"interest_rate","label_en":"Interest Rate (%)","label_es":"Tasa de Interés (%)","type":"number","required":false},
     {"key":"currency","label_en":"Currency","label_es":"Moneda","type":"select","required":false,
      "options":[{"value":"USD","label_en":"USD","label_es":"USD"},{"value":"GBP","label_en":"GBP","label_es":"GBP"},
                 {"value":"EUR","label_en":"EUR","label_es":"EUR"}]}]'::jsonb,
   'Add all outstanding loans', 'Agregue todos los préstamos pendientes'),

  (s_lo, 'lo_credit_cards', 'Credit Cards', 'Tarjetas de Crédito', 'repeating_group', FALSE, 1,
   '[{"key":"issuer","label_en":"Card Issuer","label_es":"Emisor de la Tarjeta","type":"text","required":true},
     {"key":"outstanding_balance","label_en":"Outstanding Balance","label_es":"Saldo Pendiente","type":"number","required":false},
     {"key":"credit_limit","label_en":"Credit Limit","label_es":"Límite de Crédito","type":"number","required":false},
     {"key":"monthly_minimum","label_en":"Monthly Minimum Payment","label_es":"Pago Mínimo Mensual","type":"number","required":false},
     {"key":"currency","label_en":"Currency","label_es":"Moneda","type":"select","required":false,
      "options":[{"value":"USD","label_en":"USD","label_es":"USD"},{"value":"GBP","label_en":"GBP","label_es":"GBP"},
                 {"value":"EUR","label_en":"EUR","label_es":"EUR"}]}]'::jsonb,
   'Add all credit cards', 'Agregue todas las tarjetas de crédito');

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index) VALUES
  (s_lo, 'lo_total_monthly_debt', 'Total Monthly Debt Payments', 'Total de Pagos Mensuales de Deuda', 'currency', FALSE, 2);

-- ============================================================================
-- SECTION 7: Investments
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options, help_text_en, help_text_es) VALUES
  (s_in, 'inv_existing_investments', 'Existing Investments', 'Inversiones Existentes', 'repeating_group', FALSE, 0,
   '[{"key":"institution","label_en":"Institution / Broker","label_es":"Institución / Corredor","type":"text","required":true},
     {"key":"investment_type","label_en":"Investment Type","label_es":"Tipo de Inversión","type":"select","required":false,
      "options":[{"value":"mutual_fund","label_en":"Mutual Fund","label_es":"Fondo de Inversión"},
                 {"value":"stocks","label_en":"Stocks / Equities","label_es":"Acciones"},
                 {"value":"bonds","label_en":"Bonds","label_es":"Bonos"},
                 {"value":"etf","label_en":"ETF","label_es":"ETF"},
                 {"value":"unit_linked","label_en":"Unit-Linked Policy","label_es":"Póliza Unit-Linked"},
                 {"value":"structured","label_en":"Structured Product","label_es":"Producto Estructurado"},
                 {"value":"alternative","label_en":"Alternative Investment","label_es":"Inversión Alternativa"},
                 {"value":"other","label_en":"Other","label_es":"Otro"}]},
     {"key":"current_value","label_en":"Current Value","label_es":"Valor Actual","type":"number","required":false},
     {"key":"currency","label_en":"Currency","label_es":"Moneda","type":"select","required":false,
      "options":[{"value":"USD","label_en":"USD","label_es":"USD"},{"value":"GBP","label_en":"GBP","label_es":"GBP"},
                 {"value":"EUR","label_en":"EUR","label_es":"EUR"},{"value":"AED","label_en":"AED","label_es":"AED"}]},
     {"key":"inception_date","label_en":"Start Date","label_es":"Fecha de Inicio","type":"date","required":false}]'::jsonb,
   'Add all existing investment accounts and policies', 'Agregue todas las inversiones y pólizas existentes');

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, placeholder_en, placeholder_es) VALUES
  (s_in, 'inv_preferences', 'Investment Preferences / Notes', 'Preferencias de Inversión / Notas', 'textarea', FALSE, 1,
   'Any specific preferences or restrictions...', 'Preferencias o restricciones específicas...');

-- ============================================================================
-- SECTION 8: Academic Development Fund
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options, help_text_en, help_text_es) VALUES
  (s_ad, 'adf_education_plans', 'Education Savings Plans', 'Planes de Ahorro Educativo', 'repeating_group', FALSE, 0,
   '[{"key":"child_name","label_en":"Child''s Name","label_es":"Nombre del Hijo/a","type":"text","required":true},
     {"key":"institution","label_en":"Education Institution / Target","label_es":"Institución Educativa / Objetivo","type":"text","required":false},
     {"key":"plan_type","label_en":"Plan Type","label_es":"Tipo de Plan","type":"select","required":false,
      "options":[{"value":"university_fund","label_en":"University Fund","label_es":"Fondo Universitario"},
                 {"value":"school_savings","label_en":"School Savings","label_es":"Ahorro Escolar"},
                 {"value":"529_plan","label_en":"529 Plan","label_es":"Plan 529"},
                 {"value":"endowment","label_en":"Endowment Policy","label_es":"Póliza Dotal"},
                 {"value":"other","label_en":"Other","label_es":"Otro"}]},
     {"key":"current_value","label_en":"Current Value","label_es":"Valor Actual","type":"number","required":false},
     {"key":"monthly_contribution","label_en":"Monthly Contribution","label_es":"Aportación Mensual","type":"number","required":false},
     {"key":"target_amount","label_en":"Target Amount","label_es":"Monto Objetivo","type":"number","required":false},
     {"key":"currency","label_en":"Currency","label_es":"Moneda","type":"select","required":false,
      "options":[{"value":"USD","label_en":"USD","label_es":"USD"},{"value":"GBP","label_en":"GBP","label_es":"GBP"},
                 {"value":"EUR","label_en":"EUR","label_es":"EUR"}]},
     {"key":"target_year","label_en":"Target Year","label_es":"Año Objetivo","type":"number","required":false}]'::jsonb,
   'Add education savings for each child', 'Agregue los planes de ahorro educativo de cada hijo/a');

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, placeholder_en, placeholder_es) VALUES
  (s_ad, 'adf_notes', 'Education Planning Notes', 'Notas de Planificación Educativa', 'textarea', FALSE, 1, NULL, NULL);

-- ============================================================================
-- SECTION 9: Private Pension and Savings Plan
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options, help_text_en, help_text_es) VALUES
  (s_pp, 'pp_pensions', 'Private Pension Plans', 'Planes de Pensión Privada', 'repeating_group', FALSE, 0,
   '[{"key":"provider","label_en":"Provider / Insurer","label_es":"Proveedor / Aseguradora","type":"text","required":true},
     {"key":"plan_name","label_en":"Plan Name / Policy Number","label_es":"Nombre del Plan / Número de Póliza","type":"text","required":false},
     {"key":"plan_type","label_en":"Plan Type","label_es":"Tipo de Plan","type":"select","required":false,
      "options":[{"value":"rl360","label_en":"RL360","label_es":"RL360"},
                 {"value":"hansard","label_en":"Hansard","label_es":"Hansard"},
                 {"value":"utmost","label_en":"Utmost International","label_es":"Utmost International"},
                 {"value":"zurich","label_en":"Zurich International","label_es":"Zurich International"},
                 {"value":"local_pension","label_en":"Local Pension Fund","label_es":"Fondo de Pensión Local"},
                 {"value":"other","label_en":"Other","label_es":"Otro"}]},
     {"key":"current_value","label_en":"Current Value","label_es":"Valor Actual","type":"number","required":false},
     {"key":"monthly_contribution","label_en":"Monthly Contribution","label_es":"Aportación Mensual","type":"number","required":false},
     {"key":"currency","label_en":"Currency","label_es":"Moneda","type":"select","required":false,
      "options":[{"value":"USD","label_en":"USD","label_es":"USD"},{"value":"GBP","label_en":"GBP","label_es":"GBP"},
                 {"value":"EUR","label_en":"EUR","label_es":"EUR"}]},
     {"key":"start_date","label_en":"Start Date","label_es":"Fecha de Inicio","type":"date","required":false},
     {"key":"target_maturity","label_en":"Target Maturity Date","label_es":"Fecha de Vencimiento Objetivo","type":"date","required":false}]'::jsonb,
   'Add all private pension and savings plans', 'Agregue todos los planes de pensión privada y ahorro');

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, placeholder_en, placeholder_es) VALUES
  (s_pp, 'pp_notes', 'Pension Planning Notes', 'Notas sobre Pensión Privada', 'textarea', FALSE, 1, NULL, NULL);

-- ============================================================================
-- SECTION 10: Government Pension
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index) VALUES
  (s_gp, 'gp_contributing',         'Currently Contributing to Government Pension?', '¿Cotiza actualmente a la Pensión del Gobierno?', 'boolean',  TRUE,  0),
  (s_gp, 'gp_country',              'Country / Pension System',                      'País / Sistema de Pensión',                       'text',     FALSE, 1),
  (s_gp, 'gp_years_contributed',    'Years Contributed',                             'Años Cotizados',                                  'number',   FALSE, 2),
  (s_gp, 'gp_eligible_age',         'Eligible Retirement Age',                       'Edad de Jubilación Elegible',                     'number',   FALSE, 3),
  (s_gp, 'gp_expected_monthly',     'Expected Monthly Pension',                      'Pensión Mensual Esperada',                        'currency', FALSE, 4),
  (s_gp, 'gp_notes',                'Government Pension Notes',                      'Notas sobre Pensión del Gobierno',                'textarea', FALSE, 5);

-- ============================================================================
-- SECTION 11: Retirement and Jubilation Goals
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index) VALUES
  (s_rg, 'rg_target_retirement_age',      'Target Retirement Age',               'Edad de Jubilación Deseada',            'number',   TRUE,  0),
  (s_rg, 'rg_desired_monthly_income',     'Desired Monthly Retirement Income',   'Ingreso Mensual Deseado en Jubilación', 'currency', TRUE,  1),
  (s_rg, 'rg_willing_to_relocate',        'Willing to Relocate for Retirement?', '¿Dispuesto a Relocalizarse?',           'boolean',  FALSE, 2),
  (s_rg, 'rg_preferred_location',         'Preferred Retirement Location',       'Lugar de Jubilación Preferido',         'text',     FALSE, 3),
  (s_rg, 'rg_retirement_lifestyle_notes', 'Retirement Lifestyle Notes',          'Notas sobre Estilo de Vida en Retiro',  'textarea', FALSE, 4);

-- ============================================================================
-- SECTION 12: Medium-term Goals
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options, help_text_en, help_text_es) VALUES
  (s_mt, 'mt_goals', 'Medium-term Financial Goals', 'Metas Financieras a Mediano Plazo', 'repeating_group', FALSE, 0,
   '[{"key":"goal_description","label_en":"Goal Description","label_es":"Descripción de la Meta","type":"text","required":true},
     {"key":"target_amount","label_en":"Target Amount","label_es":"Monto Objetivo","type":"number","required":false},
     {"key":"currency","label_en":"Currency","label_es":"Moneda","type":"select","required":false,
      "options":[{"value":"USD","label_en":"USD","label_es":"USD"},{"value":"GBP","label_en":"GBP","label_es":"GBP"},
                 {"value":"EUR","label_en":"EUR","label_es":"EUR"}]},
     {"key":"target_years","label_en":"Target (years from now)","label_es":"Plazo (años desde ahora)","type":"number","required":false},
     {"key":"priority","label_en":"Priority","label_es":"Prioridad","type":"select","required":false,
      "options":[{"value":"high","label_en":"High","label_es":"Alta"},
                 {"value":"medium","label_en":"Medium","label_es":"Media"},
                 {"value":"low","label_en":"Low","label_es":"Baja"}]}]'::jsonb,
   'Add financial goals to be achieved in the next 1–10 years (e.g. vacation, vehicle, property)',
   'Agregue metas financieras para los próximos 1–10 años (p. ej. vacaciones, vehículo, propiedad)');

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, placeholder_en, placeholder_es) VALUES
  (s_mt, 'mt_other_goals', 'Other Financial Goals', 'Otras Metas Financieras', 'textarea', FALSE, 1, NULL, NULL);

-- ============================================================================
-- SECTION 13: Insurance
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index) VALUES
  (s_ins, 'ins_has_life',       'Has Life Insurance?',         '¿Tiene Seguro de Vida?',                   'boolean', TRUE,  0),
  (s_ins, 'ins_has_health',     'Has Health Insurance?',       '¿Tiene Seguro de Salud?',                  'boolean', TRUE,  3),
  (s_ins, 'ins_health_provider','Health Insurance Provider',   'Proveedor de Seguro de Salud',             'text',    FALSE, 4),
  (s_ins, 'ins_has_critical',   'Has Critical Illness Cover?', '¿Tiene Cobertura por Enfermedad Crítica?', 'boolean', FALSE, 5),
  (s_ins, 'ins_has_income_prot','Has Income Protection?',      '¿Tiene Protección de Ingresos?',           'boolean', FALSE, 6),
  (s_ins, 'ins_gap_notes',      'Insurance Gaps / Notes',      'Brechas de Cobertura / Notas',             'textarea',FALSE, 7);

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options, help_text_en, help_text_es) VALUES
  (s_ins, 'ins_life_policies', 'Life Insurance Policies', 'Pólizas de Seguro de Vida', 'repeating_group', FALSE, 1,
   '[{"key":"provider","label_en":"Provider / Insurer","label_es":"Proveedor / Aseguradora","type":"text","required":true},
     {"key":"policy_type","label_en":"Policy Type","label_es":"Tipo de Póliza","type":"select","required":false,
      "options":[{"value":"term","label_en":"Term Life","label_es":"Vida a Término"},
                 {"value":"whole","label_en":"Whole Life","label_es":"Vida Entera"},
                 {"value":"universal","label_en":"Universal Life","label_es":"Vida Universal"},
                 {"value":"endowment","label_en":"Endowment","label_es":"Dotal"},
                 {"value":"other","label_en":"Other","label_es":"Otro"}]},
     {"key":"sum_assured","label_en":"Sum Assured","label_es":"Suma Asegurada","type":"number","required":false},
     {"key":"annual_premium","label_en":"Annual Premium","label_es":"Prima Anual","type":"number","required":false},
     {"key":"currency","label_en":"Currency","label_es":"Moneda","type":"select","required":false,
      "options":[{"value":"USD","label_en":"USD","label_es":"USD"},{"value":"GBP","label_en":"GBP","label_es":"GBP"},
                 {"value":"EUR","label_en":"EUR","label_es":"EUR"}]},
     {"key":"expiry_date","label_en":"Expiry / Maturity Date","label_es":"Fecha de Vencimiento","type":"date","required":false}]'::jsonb,
   'Add all life insurance policies', 'Agregue todas las pólizas de seguro de vida');

-- ============================================================================
-- SECTION 14: Risk Tolerance Questionnaire
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options, help_text_en, help_text_es) VALUES

  (s_rt, 'rt_q1', '1. What is your primary investment objective?',
   '1. ¿Cuál es su objetivo principal de inversión?',
   'select', TRUE, 0,
   '[{"value":"a","label_en":"a) Capital preservation – accept low returns (0–2%) to avoid any losses",
      "label_es":"a) Conservación del capital – acepto rendimientos bajos (0–2%) para evitar cualquier pérdida"},
     {"value":"b","label_en":"b) Modest growth – accept small temporary losses for moderate returns",
      "label_es":"b) Crecimiento modesto – acepto pequeñas pérdidas temporales a cambio de rendimientos moderados"},
     {"value":"c","label_en":"c) Balanced growth – accept medium volatility for above-average returns",
      "label_es":"c) Crecimiento equilibrado – acepto volatilidad media a cambio de rendimientos superiores al promedio"},
     {"value":"d","label_en":"d) Maximum growth – accept high volatility and significant losses for maximum long-term returns",
      "label_es":"d) Crecimiento máximo – acepto alta volatilidad y pérdidas significativas a cambio de rendimientos máximos a largo plazo"}]'::jsonb,
   NULL, NULL),

  (s_rt, 'rt_q2', '2. What is your intended investment time horizon?',
   '2. ¿Cuál es su horizonte de inversión previsto?',
   'select', TRUE, 1,
   '[{"value":"a","label_en":"a) Less than 2 years","label_es":"a) Menos de 2 años"},
     {"value":"b","label_en":"b) 2 to 5 years","label_es":"b) De 2 a 5 años"},
     {"value":"c","label_en":"c) 5 to 10 years","label_es":"c) De 5 a 10 años"},
     {"value":"d","label_en":"d) More than 10 years","label_es":"d) Más de 10 años"}]'::jsonb,
   NULL, NULL),

  (s_rt, 'rt_q3', '3. What is the maximum temporary loss you would find acceptable?',
   '3. ¿Cuál es la pérdida temporal máxima que consideraría aceptable?',
   'select', TRUE, 2,
   '[{"value":"a","label_en":"a) No losses – any drop in value is unacceptable",
      "label_es":"a) Sin pérdidas – cualquier caída en el valor es inaceptable"},
     {"value":"b","label_en":"b) Up to 10% temporary loss",
      "label_es":"b) Hasta un 10% de pérdida temporal"},
     {"value":"c","label_en":"c) Up to 25% temporary loss",
      "label_es":"c) Hasta un 25% de pérdida temporal"},
     {"value":"d","label_en":"d) More than 25% – I understand markets recover over time",
      "label_es":"d) Más del 25% – entiendo que los mercados se recuperan con el tiempo"}]'::jsonb,
   NULL, NULL),

  (s_rt, 'rt_q4', '4. How would you describe your investment experience?',
   '4. ¿Cómo describiría su experiencia de inversión?',
   'select', TRUE, 3,
   '[{"value":"a","label_en":"a) None – I have never invested",
      "label_es":"a) Ninguna – nunca he invertido"},
     {"value":"b","label_en":"b) Basic – savings accounts or fixed-term deposits only",
      "label_es":"b) Básica – solo cuentas de ahorro o depósitos a plazo fijo"},
     {"value":"c","label_en":"c) Intermediate – mutual funds, equities or bonds",
      "label_es":"c) Intermedia – fondos de inversión, acciones o bonos"},
     {"value":"d","label_en":"d) Advanced – derivatives, structured products or alternative investments",
      "label_es":"d) Avanzada – derivados, productos estructurados o inversiones alternativas"}]'::jsonb,
   NULL, NULL),

  (s_rt, 'rt_q5', '5. If your portfolio dropped 20% in value, what would you do?',
   '5. Si su cartera cayera un 20% en valor, ¿qué haría?',
   'select', TRUE, 4,
   '[{"value":"a","label_en":"a) Sell everything immediately to stop further losses",
      "label_es":"a) Vender todo de inmediato para evitar más pérdidas"},
     {"value":"b","label_en":"b) Sell a portion to reduce exposure",
      "label_es":"b) Vender una parte para reducir la exposición"},
     {"value":"c","label_en":"c) Hold and wait for the market to recover",
      "label_es":"c) Mantener y esperar la recuperación del mercado"},
     {"value":"d","label_en":"d) Buy more to take advantage of the lower prices",
      "label_es":"d) Comprar más para aprovechar los precios bajos"}]'::jsonb,
   NULL, NULL),

  (s_rt, 'rt_q6', '6. How would you describe your current financial situation?',
   '6. ¿Cómo describiría su situación financiera actual?',
   'select', TRUE, 5,
   '[{"value":"a","label_en":"a) Very dependent on my salary with no significant savings buffer",
      "label_es":"a) Muy dependiente de mi salario, sin colchón de ahorros significativo"},
     {"value":"b","label_en":"b) Dependent on salary but with some savings for emergencies",
      "label_es":"b) Dependiente del salario pero con algunos ahorros para emergencias"},
     {"value":"c","label_en":"c) Multiple income sources and solid reserves",
      "label_es":"c) Múltiples fuentes de ingresos y reservas sólidas"},
     {"value":"d","label_en":"d) Primarily investment or business income with substantial assets",
      "label_es":"d) Principalmente ingresos por inversiones o negocios con activos sustanciales"}]'::jsonb,
   NULL, NULL),

  (s_rt, 'rt_q7', '7. How would you describe your current financial obligations?',
   '7. ¿Cómo describiría sus obligaciones financieras actuales?',
   'select', TRUE, 6,
   '[{"value":"a","label_en":"a) Very high – mortgage, multiple dependents and significant debt",
      "label_es":"a) Muy altas – hipoteca, varios dependientes y deuda significativa"},
     {"value":"b","label_en":"b) High – major obligations such as mortgage or dependents",
      "label_es":"b) Altas – obligaciones importantes como hipoteca o dependientes"},
     {"value":"c","label_en":"c) Moderate – manageable commitments such as rent and standard expenses",
      "label_es":"c) Moderadas – compromisos manejables como alquiler y gastos habituales"},
     {"value":"d","label_en":"d) Low – minimal financial obligations",
      "label_es":"d) Bajas – obligaciones financieras mínimas"}]'::jsonb,
   NULL, NULL),

  (s_rt, 'rt_profile_result', 'Risk Profile Result', 'Resultado del Perfil de Riesgo',
   'computed', FALSE, 7,
   '{"conservative":{"label_en":"Conservative","label_es":"Conservador","min_score":7,"max_score":11},
     "balanced":{"label_en":"Balanced","label_es":"Equilibrado","min_score":12,"max_score":17},
     "growth":{"label_en":"Growth","label_es":"Crecimiento","min_score":18,"max_score":23},
     "aggressive":{"label_en":"Aggressive","label_es":"Agresivo","min_score":24,"max_score":28}}'::jsonb,
   'Automatically computed from your answers above',
   'Calculado automáticamente a partir de sus respuestas anteriores');

-- ============================================================================
-- SECTION 15: Available Budget for Savings
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index) VALUES
  (s_ab, 'ab_monthly_net_income',       'Total Monthly Net Income',                'Ingreso Neto Mensual Total',                    'currency', TRUE,  0),
  (s_ab, 'ab_total_monthly_expenses',   'Total Monthly Fixed Expenses',            'Gastos Fijos Mensuales Totales',                'currency', TRUE,  1),
  (s_ab, 'ab_current_monthly_savings',  'Current Monthly Savings Contribution',    'Aportación Mensual de Ahorro Actual',           'currency', FALSE, 2),
  (s_ab, 'ab_available_for_savings',    'Available Budget for New Savings',        'Presupuesto Disponible para Nuevo Ahorro',      'currency', FALSE, 3),
  (s_ab, 'ab_budget_notes',             'Budget Notes',                            'Notas sobre el Presupuesto',                   'textarea', FALSE, 4);

-- ============================================================================
-- SECTION 16: Client Required Product Characteristics
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options) VALUES
  (s_cp, 'cp_liquidity_requirement', 'Liquidity Requirement', 'Requerimiento de Liquidez', 'select', TRUE, 0,
   '[{"value":"high","label_en":"High – need access to funds within 12 months",
      "label_es":"Alta – necesito acceder a fondos dentro de 12 meses"},
     {"value":"medium","label_en":"Medium – can lock in for 1–5 years",
      "label_es":"Media – puedo bloquear fondos de 1 a 5 años"},
     {"value":"low","label_en":"Low – comfortable locking in for 5+ years",
      "label_es":"Baja – cómodo con fondos bloqueados más de 5 años"}]'::jsonb
  ),
  (s_cp, 'cp_investment_term', 'Preferred Investment Term', 'Plazo de Inversión Preferido', 'select', TRUE, 1,
   '[{"value":"short","label_en":"Short-term (1–3 years)","label_es":"Corto plazo (1–3 años)"},
     {"value":"medium","label_en":"Medium-term (3–7 years)","label_es":"Mediano plazo (3–7 años)"},
     {"value":"long","label_en":"Long-term (7+ years)","label_es":"Largo plazo (más de 7 años)"}]'::jsonb
  ),
  (s_cp, 'cp_currency_preference', 'Preferred Currency', 'Moneda de Preferencia', 'select', FALSE, 2,
   '[{"value":"USD","label_en":"USD – US Dollar","label_es":"USD – Dólar Estadounidense"},
     {"value":"GBP","label_en":"GBP – British Pound","label_es":"GBP – Libra Esterlina"},
     {"value":"EUR","label_en":"EUR – Euro","label_es":"EUR – Euro"},
     {"value":"AED","label_en":"AED – UAE Dirham","label_es":"AED – Dírham EAU"},
     {"value":"multi","label_en":"Multi-currency","label_es":"Multi-moneda"},
     {"value":"no_preference","label_en":"No preference","label_es":"Sin preferencia"}]'::jsonb
  );

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index) VALUES
  (s_cp, 'cp_ethical_restrictions',  'Has Ethical / ESG Investment Restrictions?', '¿Tiene Restricciones Éticas / ESG?',   'boolean',  FALSE, 3),
  (s_cp, 'cp_ethical_notes',         'Ethical Restrictions Description',            'Descripción de Restricciones Éticas',  'textarea', FALSE, 4),
  (s_cp, 'cp_specific_requirements', 'Specific Product Requirements',               'Requisitos Específicos del Producto',  'textarea', FALSE, 5);

-- ============================================================================
-- SECTION 17: Additional Notes and References
-- ============================================================================
INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options) VALUES
  (s_an, 'an_referral_source', 'How did the client hear about us?', '¿Cómo se enteró el cliente de nosotros?', 'select', FALSE, 0,
   '[{"value":"referral","label_en":"Client Referral","label_es":"Referido por Cliente"},
     {"value":"ifa_referral","label_en":"IFA / Advisor Referral","label_es":"Referido por Asesor"},
     {"value":"internet","label_en":"Internet / Search","label_es":"Internet / Búsqueda"},
     {"value":"social_media","label_en":"Social Media","label_es":"Redes Sociales"},
     {"value":"event","label_en":"Event / Seminar","label_es":"Evento / Seminario"},
     {"value":"existing_client","label_en":"Existing Client","label_es":"Cliente Existente"},
     {"value":"other","label_en":"Other","label_es":"Otro"}]'::jsonb
  );

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, placeholder_en, placeholder_es) VALUES
  (s_an, 'an_referral_name',       'Referral Name (if applicable)',  'Nombre del Referente (si aplica)',  'text',     FALSE, 1, NULL, NULL),
  (s_an, 'an_advisor_observations','Advisor Observations',           'Observaciones del Asesor',          'textarea', FALSE, 2, NULL, NULL),
  (s_an, 'an_next_steps',          'Agreed Next Steps',              'Próximos Pasos Acordados',          'textarea', FALSE, 3, NULL, NULL),
  (s_an, 'an_follow_up_date',      'Follow-up Date',                 'Fecha de Seguimiento',              'date',     FALSE, 4, NULL, NULL);

INSERT INTO fp_fields (section_id, key, label_en, label_es, field_type, is_required, order_index, options, help_text_en, help_text_es) VALUES
  (s_an, 'an_documents_received', 'Documents Received', 'Documentos Recibidos', 'multiselect', FALSE, 5,
   '[{"value":"passport","label_en":"Passport / ID","label_es":"Pasaporte / Cédula"},
     {"value":"proof_of_address","label_en":"Proof of Address","label_es":"Comprobante de Domicilio"},
     {"value":"bank_statements","label_en":"Bank Statements","label_es":"Estados de Cuenta Bancarios"},
     {"value":"payslips","label_en":"Payslips / Income Proof","label_es":"Recibos de Nómina / Prueba de Ingresos"},
     {"value":"tax_returns","label_en":"Tax Returns","label_es":"Declaraciones de Impuestos"},
     {"value":"existing_policies","label_en":"Existing Policy Documents","label_es":"Documentos de Pólizas Existentes"},
     {"value":"other","label_en":"Other","label_es":"Otro"}]'::jsonb,
   'Mark all documents collected during this meeting', 'Marque todos los documentos recopilados en esta reunión');

END $$;
