-- ============================================================
-- 20260814100000_rename_zurich_platform_code_to_portman.sql
-- The platform record for "Portman Associates" statements was originally
-- seeded with code 'ZURICH' (a naming artifact, unrelated to the actual
-- Zurich International insurer). Renaming to 'PORTMAN' to match the real
-- provider and the Landing.ai schema/transform keyed to it.
-- ============================================================

UPDATE platforms SET code = 'PORTMAN' WHERE code = 'ZURICH';
