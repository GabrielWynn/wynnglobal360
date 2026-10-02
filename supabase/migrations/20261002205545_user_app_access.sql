-- =============================================================================
-- Per-user app access
-- Migration: 20261002205545_user_app_access
-- =============================================================================
--
-- Which hub apps each user can open is decided by user_app_access, one row
-- per user per app. ifas.role no longer gates apps: it is a template that
-- pre-fills these rows for a new user (role_app_defaults), and 'admin' is
-- the one role that can open every app without rows here.
--
-- App slugs match lib/apps.ts and the app's URL: 'commission',
-- 'financial-planner', 'model-portfolio', 'risk-matrix', 'ai-chatbot'.
--
-- RLS is enabled with no policies, so both tables are reachable only through
-- the service role (middleware, layouts and the /api/admin routes).
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Access grants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_app_access (
  ifa_id     UUID        NOT NULL REFERENCES ifas(id) ON DELETE CASCADE,
  app_slug   TEXT        NOT NULL,
  -- 'manager' is reserved for per-app admin powers; nothing reads it yet.
  level      TEXT        NOT NULL DEFAULT 'user' CHECK (level IN ('user', 'manager')),
  granted_by UUID        REFERENCES ifas(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ifa_id, app_slug)
);

CREATE INDEX IF NOT EXISTS idx_user_app_access_app
  ON user_app_access(app_slug);

-- ---------------------------------------------------------------------------
-- Role templates – the apps a new user of each role starts with
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_app_defaults (
  role     VARCHAR(20) NOT NULL,
  app_slug TEXT        NOT NULL,
  PRIMARY KEY (role, app_slug)
);

INSERT INTO role_app_defaults (role, app_slug) VALUES
  ('ifa',        'commission'),
  ('ifa',        'financial-planner'),
  ('ifa',        'model-portfolio'),
  ('ifa',        'ai-chatbot'),
  ('compliance', 'risk-matrix')
ON CONFLICT DO NOTHING;

ALTER TABLE user_app_access   ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_app_defaults ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Every new ifas row gets its role's template, whichever code path creates it
-- (admin invite, commission "add IFA", commission upload auto-create).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grant_role_default_apps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_app_access (ifa_id, app_slug)
  SELECT NEW.id, d.app_slug
  FROM role_app_defaults d
  WHERE d.role = COALESCE(NEW.role, 'ifa')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION grant_role_default_apps() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ifas_grant_default_apps ON ifas;
CREATE TRIGGER trg_ifas_grant_default_apps
  AFTER INSERT ON ifas
  FOR EACH ROW EXECUTE FUNCTION grant_role_default_apps();

-- ---------------------------------------------------------------------------
-- Seed existing users with exactly what they could open before this change:
-- every non-admin saw Commission, Financial Planner, Model Portfolio and the
-- AI card; compliance users also saw Risk Matrix.
-- Runs only while the table is still empty, so re-running this file never
-- gives back an app an admin has since removed from a user.
-- ---------------------------------------------------------------------------
INSERT INTO user_app_access (ifa_id, app_slug)
SELECT i.id, a.slug
FROM ifas i
CROSS JOIN (VALUES
  ('commission'), ('financial-planner'), ('model-portfolio'),
  ('ai-chatbot'), ('risk-matrix')
) AS a(slug)
WHERE COALESCE(i.role, 'ifa') <> 'admin'
  AND (a.slug <> 'risk-matrix' OR i.role = 'compliance')
  AND NOT EXISTS (SELECT 1 FROM user_app_access)
ON CONFLICT DO NOTHING;
