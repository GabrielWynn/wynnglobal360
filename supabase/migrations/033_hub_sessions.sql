-- Migration 033: Hub sessions
-- No DDL changes required.
--
-- Supabase manages sessions natively via the auth schema (auth.sessions,
-- auth.refresh_tokens).  The hub's 27-minute inactivity timeout is enforced
-- entirely in the browser by components/SessionTimeout.tsx — it listens for
-- user activity events, fires supabase.auth.signOut() after 27 minutes of
-- inactivity, and redirects to /login on the SIGNED_OUT auth event.
--
-- The JWT expiry is configured in the Supabase dashboard (see
-- supabase/config/auth-settings.sql for the recommended dashboard SQL).
-- Setting it to 1800 s (30 min) means a token is valid for at most 30 min;
-- the app-level 27-min timeout fires first in normal use.
--
-- No SQL needed here — this file is intentionally a no-op and exists only
-- to document the session architecture decision.

-- Verify the auth schema is healthy (informational, no side effects):
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'auth'
      AND table_name   = 'sessions'
  ), 'auth.sessions table not found — check Supabase version';

  RAISE NOTICE 'Migration 033: auth.sessions confirmed present. No DDL changes needed.';
END $$;
