-- ============================================================
-- 20260813130000_add_ardan_platform.sql
-- Registers ARDAN as a commission platform so it's selectable in the
-- upload wizard. ARDAN Structured Note PDF statements use a dedicated
-- Landing.ai extraction schema + row transform (see
-- lib/commission/extraction-schemas.ts and lib/commission/platform-extraction.ts).
-- ============================================================

INSERT INTO platforms (code, name, is_active)
VALUES ('ARDAN', 'ARDAN', true)
ON CONFLICT (code) DO NOTHING;
