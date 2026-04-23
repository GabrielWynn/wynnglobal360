-- ============================================================
-- 034_admin_audit_log.sql
-- Adds admin_audit_log and system_settings tables
-- ============================================================

-- ============================================================
-- TABLE: admin_audit_log
-- Tracks all administrative actions (user invite, role/status changes)
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id           UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  actor_id     UUID        DEFAULT NULL REFERENCES ifas(id) ON DELETE SET NULL,
  actor_email  TEXT        NOT NULL,
  action       VARCHAR(50) NOT NULL,   -- 'user.invite' | 'user.role_change' | 'user.deactivate' | 'user.reactivate'
  target_id    UUID        DEFAULT NULL,
  target_email TEXT        DEFAULT NULL,
  before_data  JSONB       DEFAULT NULL,
  after_data   JSONB       DEFAULT NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor_id  ON admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_id ON admin_audit_log(target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action    ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created   ON admin_audit_log(created_at DESC);

-- ============================================================
-- TABLE: system_settings
-- Key/value store for platform-wide admin-configurable settings
-- ============================================================

CREATE TABLE IF NOT EXISTS system_settings (
  key         VARCHAR(100) NOT NULL PRIMARY KEY,
  value       JSONB        NOT NULL DEFAULT '{}',
  description TEXT         DEFAULT NULL,
  updated_by  UUID         DEFAULT NULL REFERENCES ifas(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default settings
INSERT INTO system_settings (key, value, description) VALUES
  ('default_payment_threshold',  '500',   'Default payment threshold (USD) for new IFA accounts'),
  ('default_show_negative_balance', 'false', 'Whether new IFA accounts show negative balance by default'),
  ('commission_approval_required', 'true', 'Require explicit admin approval before commissions are paid')
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_version (version, applied_at) VALUES ('0.34.0', NOW()) ON CONFLICT DO NOTHING;
