-- =============================================================================
-- Portfolio Compositions schema
--
-- Replaces the period-based mp_portfolio_periods / mp_portfolio_holdings model
-- for UI/calculation purposes. Old tables are kept as a historical archive.
--
-- A "composition" is a snapshot of which funds (ISINs) are held at which
-- weights, valid from effective_from until effective_to (null = still active).
-- =============================================================================

CREATE TABLE IF NOT EXISTS mp_portfolio_compositions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id    UUID NOT NULL REFERENCES mp_platforms(id)      ON DELETE CASCADE,
  profile_id     UUID NOT NULL REFERENCES mp_risk_profiles(id),
  effective_from DATE NOT NULL,
  effective_to   DATE,        -- null means this is the current composition
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform_id, profile_id, effective_from)
);

CREATE TABLE IF NOT EXISTS mp_composition_holdings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composition_id UUID NOT NULL REFERENCES mp_portfolio_compositions(id) ON DELETE CASCADE,
  fund_id        UUID NOT NULL REFERENCES mp_funds(id),
  weight         NUMERIC(8, 6) NOT NULL CHECK (weight > 0 AND weight <= 1),
  UNIQUE (composition_id, fund_id)
);

-- Fast lookup: "what composition was active on date D for platform P / profile R?"
CREATE INDEX IF NOT EXISTS idx_mp_comps_lookup
  ON mp_portfolio_compositions(platform_id, profile_id, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_mp_comp_holdings_comp
  ON mp_composition_holdings(composition_id);
