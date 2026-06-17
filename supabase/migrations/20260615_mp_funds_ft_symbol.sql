-- Cache FT Markets internal symbol id (from tearsheet data-mod-config) per fund.
-- Avoids re-fetching the tearsheet HTML on every price sync.

ALTER TABLE mp_funds
  ADD COLUMN IF NOT EXISTS ft_symbol TEXT;

CREATE INDEX IF NOT EXISTS idx_mp_funds_ft_symbol
  ON mp_funds(ft_symbol)
  WHERE ft_symbol IS NOT NULL;
