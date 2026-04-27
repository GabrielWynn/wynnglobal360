-- =============================================================================
-- Model Portfolio schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- platforms  (RL360, FPI, UTMOST, Utmost Below, Hansard)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_platforms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- risk_profiles  (Perfil A → D, shared across all platforms)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_risk_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL UNIQUE,   -- 'A', 'B', 'C', 'D'
  name        TEXT NOT NULL,          -- 'Conservative', 'Moderate', etc.
  risk_level  INTEGER NOT NULL        -- 1 (lowest) → 4 (highest)
);

-- ---------------------------------------------------------------------------
-- funds  (normalised by ISIN; one row per real-world fund)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_funds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isin          TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  eodhd_ticker  TEXT,          -- e.g. '0P0000MXHJ.F' after EODHD lookup
  eodhd_exchange TEXT,         -- e.g. 'F', 'LSE', 'PA'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- fund_aliases  (platform-specific display names for the same ISIN)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_fund_aliases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id     UUID NOT NULL REFERENCES mp_funds(id) ON DELETE CASCADE,
  platform_id UUID NOT NULL REFERENCES mp_platforms(id) ON DELETE CASCADE,
  alias_name  TEXT NOT NULL,
  UNIQUE (fund_id, platform_id)
);

-- ---------------------------------------------------------------------------
-- portfolio_periods  (one row per platform + date-range slice)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_portfolio_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES mp_platforms(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,      -- original CSV label, kept for traceability
  start_date  DATE NOT NULL,
  end_date    DATE,               -- NULL means the period is still open
  is_open     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform_id, start_date)
);

-- ---------------------------------------------------------------------------
-- portfolio_holdings  (versioned: one row per period × profile × fund)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_portfolio_holdings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id        UUID NOT NULL REFERENCES mp_portfolio_periods(id) ON DELETE CASCADE,
  profile_id       UUID NOT NULL REFERENCES mp_risk_profiles(id),
  fund_id          UUID NOT NULL REFERENCES mp_funds(id),
  weight           NUMERIC(8, 6)  NOT NULL,   -- e.g. 0.500000
  initial_price    NUMERIC(16, 6),
  final_price      NUMERIC(16, 6),
  return_pct       NUMERIC(12, 8),
  weighted_return  NUMERIC(12, 8),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period_id, profile_id, fund_id)
);

-- ---------------------------------------------------------------------------
-- fund_prices  (daily NAV fetched from EODHD, one row per fund × date)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_fund_prices (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id   UUID NOT NULL REFERENCES mp_funds(id) ON DELETE CASCADE,
  date      DATE NOT NULL,
  price     NUMERIC(16, 6) NOT NULL,
  source    TEXT NOT NULL DEFAULT 'eodhd',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fund_id, date)
);

-- ---------------------------------------------------------------------------
-- benchmarks  (S&P 500, MSCI World, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_benchmarks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  ticker       TEXT NOT NULL UNIQUE,  -- EODHD format, e.g. 'GSPC.INDX'
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- benchmark_prices  (daily closes, one row per benchmark × date)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_benchmark_prices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id UUID NOT NULL REFERENCES mp_benchmarks(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  price        NUMERIC(16, 6) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (benchmark_id, date)
);

-- ---------------------------------------------------------------------------
-- portfolio_changes_log  (admin audit trail for structure changes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_portfolio_changes_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id  UUID REFERENCES mp_platforms(id),
  profile_id   UUID REFERENCES mp_risk_profiles(id),
  fund_id      UUID REFERENCES mp_funds(id),
  change_type  TEXT NOT NULL,  -- 'fund_added' | 'fund_removed' | 'weight_changed' | 'isin_changed'
  old_value    JSONB,
  new_value    JSONB,
  changed_by   UUID,           -- Supabase auth user id
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_mp_holdings_period    ON mp_portfolio_holdings(period_id);
CREATE INDEX IF NOT EXISTS idx_mp_holdings_profile   ON mp_portfolio_holdings(profile_id);
CREATE INDEX IF NOT EXISTS idx_mp_holdings_fund      ON mp_portfolio_holdings(fund_id);
CREATE INDEX IF NOT EXISTS idx_mp_periods_platform   ON mp_portfolio_periods(platform_id);
CREATE INDEX IF NOT EXISTS idx_mp_periods_dates      ON mp_portfolio_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_mp_fund_prices_fund   ON mp_fund_prices(fund_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_mp_bench_prices_bench ON mp_benchmark_prices(benchmark_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_mp_aliases_fund       ON mp_fund_aliases(fund_id);

-- =============================================================================
-- Seed: static reference data
-- =============================================================================

-- Platforms
INSERT INTO mp_platforms (name, slug) VALUES
  ('RL360',        'rl360'),
  ('FPI',          'fpi'),
  ('UTMOST',       'utmost'),
  ('Utmost Below', 'utmost-below'),
  ('Hansard',      'hansard')
ON CONFLICT (slug) DO NOTHING;

-- Risk profiles
INSERT INTO mp_risk_profiles (label, name, risk_level) VALUES
  ('A', 'Conservative',        1),
  ('B', 'Moderate',            2),
  ('C', 'Moderate Aggressive', 3),
  ('D', 'Aggressive',          4)
ON CONFLICT (label) DO NOTHING;

-- Benchmarks
INSERT INTO mp_benchmarks (name, ticker, description) VALUES
  ('S&P 500',              'GSPC.INDX',  'Standard & Poors 500 Index'),
  ('MSCI World',           'IWDA.LSE',   'iShares Core MSCI World ETF (LSE)'),
  ('MSCI Emerging Markets','IEEM.LSE',   'iShares MSCI Emerging Markets ETF (LSE)'),
  ('Global Agg Bond',      'AGGG.LSE',   'iShares Core Global Aggregate Bond ETF (LSE)')
ON CONFLICT (ticker) DO NOTHING;
