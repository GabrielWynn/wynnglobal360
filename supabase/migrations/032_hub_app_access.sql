-- Migration 032: Hub app access
-- Adds supporting indexes for the Wynn Global 360 hub layer.
--
-- Access control design decision:
--   All hub app access is governed by ifas.role ('admin' | 'ifa') and
--   ifas.status ('active' | 'inactive').  No separate permissions table is
--   needed right now — the hub has one app per role tier and inactive users
--   are blocked at the Supabase Auth level (ban_duration) as well as at the
--   middleware level.
--
--   If per-user, per-app entitlement is needed in future the recommended
--   approach is a separate user_app_permissions table (see commented block
--   below) rather than adding columns to ifas, so the ifas table stays lean.
--
-- Run in Supabase SQL Editor (or via supabase db push).
-- Safe to re-run: all statements use IF NOT EXISTS / DO blocks.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Indexes on ifas(role) and ifas(status)
--    The hub layout and middleware both query these columns on every request.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS ifas_role_idx
  ON public.ifas (role);

CREATE INDEX IF NOT EXISTS ifas_status_idx
  ON public.ifas (status);

-- Combined index used by the "active admin" check that appears in both
-- middleware role resolution and commission admin guards.
CREATE INDEX IF NOT EXISTS ifas_role_status_idx
  ON public.ifas (role, status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. (Optional / future) Per-app permission table
--    Uncomment and run when granular entitlement is required.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The hub currently surfaces these app slugs:
--   'commission'        — Commission Management (live)
--   'financial-planner' — Financial Planner (coming soon)
--   'model-portfolio'   — Model Portfolio (coming soon)
--   'ai-assistant'      — AI Assistant (coming soon)
--
-- CREATE TABLE IF NOT EXISTS public.user_app_permissions (
--   id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
--   ifa_id     UUID        NOT NULL REFERENCES public.ifas(id) ON DELETE CASCADE,
--   app_slug   TEXT        NOT NULL,
--   granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--   granted_by UUID        REFERENCES public.ifas(id),
--   UNIQUE (ifa_id, app_slug)
-- );
--
-- ALTER TABLE public.user_app_permissions ENABLE ROW LEVEL SECURITY;
--
-- -- Admins can manage all permissions
-- CREATE POLICY "Admins manage app permissions"
--   ON public.user_app_permissions FOR ALL TO authenticated
--   USING      (public.current_user_is_admin())
--   WITH CHECK (public.current_user_is_admin());
--
-- -- Users can read their own permissions
-- CREATE POLICY "Users read own app permissions"
--   ON public.user_app_permissions FOR SELECT TO authenticated
--   USING (ifa_id = public.get_my_ifa_id());
--
-- CREATE INDEX IF NOT EXISTS user_app_permissions_ifa_id_idx
--   ON public.user_app_permissions (ifa_id);
--
-- CREATE INDEX IF NOT EXISTS user_app_permissions_app_slug_idx
--   ON public.user_app_permissions (app_slug);
