-- =============================================================================
-- Fund look-through fundamentals
--
-- Stores asset allocation, world region, sector, country, and top-holdings
-- data fetched from the EODHD Fundamentals API.
--
-- One row per fund (UNIQUE on fund_id).  Upserted on each sync run.
-- All percentage breakdowns are stored as JSONB maps:
--   { "label": percentage_as_float }   e.g.  { "US Stocks": 62.31 }
-- Top holdings are stored as a JSONB array of objects.
-- =============================================================================

CREATE TABLE IF NOT EXISTS mp_fund_fundamentals (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id          UUID        NOT NULL REFERENCES mp_funds(id) ON DELETE CASCADE,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_type         TEXT,           -- 'ETF' | 'Mutual Fund' etc. (EODHD General.Type)
  asset_allocation JSONB,          -- { "Cash": 5.12, "US Stocks": 62.31, ... }
  world_regions    JSONB,          -- { "North America": 62.31, "Europe": 14.2, ... }
  sector_weights   JSONB,          -- { "Technology": 28.14, "Healthcare": 12.5, ... }
  country_exposure JSONB,          -- { "United States": 62.31, "Japan": 6.14, ... }
  top_holdings     JSONB,          -- [{ rank, name, ticker, sector, country, weight_pct }]
  UNIQUE (fund_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_fund_fundamentals_fetched
  ON mp_fund_fundamentals(fetched_at);
