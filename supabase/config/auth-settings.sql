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
--   E. Custom SMTP (Resend) — branded sender for invite/reset/magic-link emails
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
-- INCIDENT (2026-08-05): live config did not match this doc — Redirect URLs
-- was completely empty and Site URL was "https://wynnglobal360.vercel.app/login".
-- Every redirectTo the app passes (accept-invite, reset-password, /advisors
-- post-OAuth landing) was silently rejected and fell back to that raw Site
-- URL, so invite/reset links sent users to /login instead of the intended
-- page. Found while testing the Resend invite integration (see
-- app/api/commission/ifas/route.ts) — the generated action_link's redirect_to
-- came back as the Site URL, not the requested redirectTo. Fixed in the
-- dashboard same day and re-verified: action_link now correctly resolves to
-- .../accept-invite instead of falling back to .../login.
--
-- Site URL (the canonical origin Supabase uses in auth emails):
--   https://www.wynnglobal360.com
--
-- Redirect URLs — one wildcard entry per domain covers every path
-- (Supabase glob-matches redirect_to against this list; ** crosses path
-- separators, see https://supabase.com/docs/guides/auth/concepts/redirect-urls):
--   https://www.wynnglobal360.com/**
--   https://wynnglobal360.vercel.app/**
--   http://localhost:3000/**        ← keep for local dev
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


-- ─────────────────────────────────────────────────────────────────────────────
-- E. Custom SMTP (Resend) — branded sender for invite/reset/magic-link emails
-- ─────────────────────────────────────────────────────────────────────────────
-- Where:  Supabase Dashboard → Project Settings → Authentication → SMTP Settings
--
-- Why:
--   Without custom SMTP, all Auth emails (invite, password reset, magic link)
--   send from the shared "noreply@mail.app.supabase.io" address with no
--   branding and a low built-in rate limit — fine for dev, not for production.
--   This also fixed a real incident: an admin invited an IFA whose email
--   already had a Supabase Auth account from an earlier deleted/recreated
--   IFA record — inviteUserByEmail() rejected it with 422 "already
--   registered" and the app silently swallowed the error (see
--   app/api/commission/ifas/route.ts). The code now falls back to a
--   password-reset email in that case; this section is unrelated to that
--   fix, just recorded here since both surfaced in the same investigation.
--
-- Resend prerequisites (resend.com dashboard):
--   1. Domains → verify wynnglobal360.com (add the SPF/DKIM/DMARC records
--      Resend provides — required before sending from @wynnglobal360.com).
--   2. API Keys → create a key with "Sending access".
--
-- Supabase SMTP Settings fields:
--   Sender email     noreply@wynnglobal360.com   (must be on verified domain)
--   Sender name      Wynn Global 360
--   Host             smtp.resend.com
--   Port             587                          (STARTTLS)
--   Username         resend                       (literal string)
--   Password         <Resend API key>              — enter directly in the
--                                                     dashboard, never commit it
--
-- Management API equivalent (requires a personal access token from
-- https://supabase.com/dashboard/account/tokens — NOT the service_role key):
--   curl -X PATCH https://api.supabase.com/v1/projects/{ref}/config/auth \
--     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--     -H "Content-Type: application/json" \
--     -d '{
--       "smtp_admin_email": "noreply@wynnglobal360.com",
--       "smtp_host": "smtp.resend.com",
--       "smtp_port": 587,
--       "smtp_user": "resend",
--       "smtp_pass": "<Resend API key>",
--       "smtp_sender_name": "Wynn Global 360"
--     }'
--
-- After saving, send a test invite/reset and confirm in the dashboard
-- (Authentication → Logs) that mail_from shows noreply@wynnglobal360.com
-- instead of noreply@mail.app.supabase.io.
