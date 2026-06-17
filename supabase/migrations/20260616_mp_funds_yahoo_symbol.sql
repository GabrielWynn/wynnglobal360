-- Cache Yahoo Finance symbol resolved from ISIN search (tertiary price source).

ALTER TABLE mp_funds
  ADD COLUMN IF NOT EXISTS yahoo_symbol TEXT;

CREATE INDEX IF NOT EXISTS idx_mp_funds_yahoo_symbol
  ON mp_funds(yahoo_symbol)
  WHERE yahoo_symbol IS NOT NULL;
