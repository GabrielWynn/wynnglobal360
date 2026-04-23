-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase Auth Configuration — Wynn Global 360 Hub
-- ═══════════════════════════════════════════════════════════════════════════
--
-- IMPORTANT: This file is NOT a migration.
-- Most of these settings live in auth.config and can only be changed through
-- the Supabase dashboard UI or the Management API — not via SQL run in the
-- SQL Editor.  This file documents each setting and explains WHERE to change
-- it so the project config is fully reproducible.
--
-- Sections:
--   A. JWT expiry
--   B. Site URL & redirect URLs
--   C. Azure / Microsoft OAuth provider
--   D. Verification — SQL you CAN run to confirm current values
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- A. JWT Expiry — 1800 seconds (30 minutes)
-- ─────────────────────────────────────────────────────────────────────────────
-- Where:  Supabase Dashboard → Authentication → Configuration → JWT Settings
--         "JWT expiry limit" field → set to 1800
--
-- Why 1800 s:
--   Supabase enforces a minimum of 300 s (5 min).  Our app-level inactivity
--   timeout fires at 27 min (1620 s), so a 30-min (1800 s) JWT means the
--   token is still valid when the inactivity modal triggers — the signOut()
--   call in SessionTimeout.tsx is what actually revokes the session.
--   Setting the JWT lower than the app timeout would cause silent 401 errors
--   before the modal ever appears.
--
-- Dashboard path (as of Supabase dashboard v2):
--   Project Settings → Auth → JWT Settings → JWT expiry
--
-- Management API equivalent (requires service_role or management token):
--   PATCH https://api.supabase.com/v1/projects/{ref}/config/auth
--   Body: { "jwt_exp": 1800 }


-- ─────────────────────────────────────────────────────────────────────────────
-- B. Site URL & Redirect URLs
-- ─────────────────────────────────────────────────────────────────────────────
-- Where:  Supabase Dashboard → Authentication → URL Configuration
--
-- Site URL (the canonical origin Supabase uses in auth emails):
--   https://www.wynnglobal360.com
--
-- Additional redirect URLs (add all of these):
--   https://www.wynnglobal360.com/advisors
--   https://www.wynnglobal360.com/api/auth/callback
--   http://localhost:3000/advisors          ← keep for local dev
--   http://localhost:3000/api/auth/callback ← keep for local dev
--
-- Notes:
--   • Supabase matches redirect_to against this allowlist; any URL not listed
--     will be rejected and the user will land on the Site URL instead.
--   • The /api/auth/callback route is used by the Azure OAuth PKCE flow.
--   • /advisors is used by signInWithOAuth({ options: { redirectTo: ... } })
--     in the login page for post-OAuth landing.


-- ─────────────────────────────────────────────────────────────────────────────
-- C. Azure / Microsoft OAuth Provider
-- ─────────────────────────────────────────────────────────────────────────────
-- Where:  Supabase Dashboard → Authentication → Providers → Azure
--
-- Step 1 — Register an app in Azure Portal (Entra ID):
--   Portal: https://portal.azure.com → Azure Active Directory → App registrations
--   → New registration
--     Name:           Wynn Global 360 Hub
--     Redirect URI:   Web → https://your-supabase-project.supabase.co/auth/v1/callback
--   → After creation, note the Application (client) ID and Directory (tenant) ID.
--   → Certificates & secrets → New client secret → copy the VALUE (shown once).
--   → API permissions → Add → Microsoft Graph → User.Read (delegated) → Grant consent.
--
-- Step 2 — Configure Supabase:
--   Supabase Dashboard → Authentication → Providers → Azure → Enable
--     Client ID:      <Application (client) ID from step 1>
--     Client Secret:  <Client secret VALUE from step 1>
--     Tenant ID / Azure tenant URL:
--       For a specific organisation tenant:  https://login.microsoftonline.com/{tenant-id}
--       For any Microsoft account:           https://login.microsoftonline.com/common
--
-- Step 3 — The login page already calls:
--   supabase.auth.signInWithOAuth({
--     provider: 'azure',
--     options: { redirectTo: siteUrl + '/advisors' }
--   })
--   No code changes needed once the provider is enabled.
--
-- Step 4 — Verify the callback URL in Azure matches exactly:
--   https://<your-project-ref>.supabase.co/auth/v1/callback
--   This is Supabase's own callback endpoint — not your app's /api/auth/callback.


-- ─────────────────────────────────────────────────────────────────────────────
-- D. Verification queries — run these in the SQL Editor to confirm settings
-- ─────────────────────────────────────────────────────────────────────────────

-- D1. Check current JWT expiry (in seconds):
SELECT
  config_key,
  config_value
FROM auth.config
WHERE config_key = 'jwt_exp';
-- Expected: 1800

-- D2. Confirm indexes added in migration 032 exist:
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE tablename = 'ifas'
  AND indexname IN (
    'ifas_user_id_idx',   -- from migration 002
    'ifas_role_idx',      -- from migration 032
    'ifas_status_idx',    -- from migration 032
    'ifas_role_status_idx' -- from migration 032
  )
ORDER BY indexname;
-- Expected: 4 rows

-- D3. Confirm auth.sessions table is present (from migration 033 assertion):
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'auth'
  AND table_name = 'sessions';
-- Expected: 1 row

-- D4. List all enabled auth providers:
SELECT
  provider_id,
  enabled,
  created_at,
  updated_at
FROM auth.sso_providers;
-- Note: OAuth providers (Azure, Google, etc.) are NOT in this table —
-- they are stored in auth.config as JSON.  Use the Dashboard to verify them.

-- D5. Spot-check ifas table columns (confirms 032 didn't alter the table):
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'ifas'
ORDER BY ordinal_position;
