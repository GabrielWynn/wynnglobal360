-- ============================================================
-- 20260910120000_agent_adjustment_due_wg_allocation.sql
-- Links individual "Due WG" rows to the lump-sum "Agent Adjustments"
-- payment they belong to, so a manual accrual (due_wg) can be
-- allocated against the real incoming receipt that explains it.
-- ============================================================

-- Documents the existing ad-hoc `due_wg` column in migration history
-- (it predates tracked migrations; this is a no-op if it already exists).
ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS due_wg NUMERIC(14,2);

-- Marks a commission_records row as a lump-sum "Agent Adjustments" receipt
-- (no policy number, imported as-is from a statement). Set at import time.
ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS is_agent_adjustment BOOLEAN NOT NULL DEFAULT FALSE;

-- On a Due WG row: which Agent Adjustment row it has been allocated to.
-- Self-referencing FK, many Due WG rows -> one adjustment row.
-- Distinct from `allocation_parent_id` (secondary-IFA commission splits) —
-- an unrelated feature with a different relationship.
ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS agent_adjustment_id UUID
    REFERENCES commission_records(id) ON DELETE SET NULL;

-- Lifecycle of that allocation: pending (linked, not yet confirmed) or
-- paid (manually confirmed settled — the only thing that reduces the
-- adjustment's outstanding Due). Only meaningful once agent_adjustment_id
-- is set; harmless default otherwise.
ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS due_wg_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (due_wg_status IN ('pending', 'paid'));

CREATE INDEX IF NOT EXISTS idx_commission_records_agent_adjustment_id
  ON commission_records(agent_adjustment_id);

CREATE INDEX IF NOT EXISTS idx_commission_records_is_agent_adjustment
  ON commission_records(is_agent_adjustment) WHERE is_agent_adjustment = TRUE;

-- Track the new fields in the audit trigger (full function replace, mirrors
-- 20260518120000_fix_commission_audit_trigger.sql with 3 fields appended).
CREATE OR REPLACE FUNCTION public.log_commission_record_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_changes      JSONB   := '{}';
  v_user_email   TEXT;
  v_uid          UUID    := auth.uid();
  tracked_fields TEXT[]  := ARRAY[
    'amount', 'variable_amount',
    'ifa_percentage', 'suspense_percentage', 'wgi_percentage',
    'ifa_amount', 'suspense_amount', 'wg_amount',
    'due_wg', 'paid', 'unpaid', 'status',
    'notes', 'ifa_notes', 'rate', 'ape', 'ape_wgi',
    'is_deleted', 'ifa_id', 'platform_id', 'commission_type',
    'is_agent_adjustment', 'agent_adjustment_id', 'due_wg_status'
  ];
  f       TEXT;
  old_val TEXT;
  new_val TEXT;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_uid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO admin_audit_log (
      actor_id, actor_email, action, target_id, after_data
    )
    VALUES (
      v_uid,
      COALESCE(v_user_email, 'system@internal'),
      'commission.record.insert',
      NEW.id,
      jsonb_build_object(
        'table_name', 'commission_records',
        'policy_number', NEW.policy_number,
        'changes', NULL
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    FOREACH f IN ARRAY tracked_fields LOOP
      EXECUTE format('SELECT ($1).%I::TEXT', f) INTO old_val USING OLD;
      EXECUTE format('SELECT ($1).%I::TEXT', f) INTO new_val USING NEW;
      IF old_val IS DISTINCT FROM new_val THEN
        v_changes := v_changes || jsonb_build_object(
          f, jsonb_build_object('old', old_val, 'new', new_val)
        );
      END IF;
    END LOOP;

    IF v_changes <> '{}' THEN
      INSERT INTO admin_audit_log (
        actor_id, actor_email, action, target_id, before_data, after_data
      )
      VALUES (
        v_uid,
        COALESCE(v_user_email, 'system@internal'),
        'commission.record.update',
        NEW.id,
        jsonb_build_object(
          'table_name', 'commission_records',
          'policy_number', NEW.policy_number
        ),
        jsonb_build_object(
          'table_name', 'commission_records',
          'policy_number', NEW.policy_number,
          'changes', v_changes
        )
      );
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO admin_audit_log (
      actor_id, actor_email, action, target_id, before_data, after_data
    )
    VALUES (
      v_uid,
      COALESCE(v_user_email, 'system@internal'),
      'commission.record.delete',
      OLD.id,
      jsonb_build_object(
        'table_name', 'commission_records',
        'policy_number', OLD.policy_number,
        'changes', NULL
      ),
      NULL
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;
