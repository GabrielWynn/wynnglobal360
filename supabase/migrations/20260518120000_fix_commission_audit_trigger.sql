-- ============================================================
-- 20260518120000_fix_commission_audit_trigger.sql
-- Route commission_records audit trigger to admin_audit_log.
-- Fixes: column "changes" of relation "audit_log" does not exist
-- ============================================================

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
    'is_deleted', 'ifa_id', 'platform_id', 'commission_type'
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
      actor_id,
      actor_email,
      action,
      target_id,
      after_data
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
        actor_id,
        actor_email,
        action,
        target_id,
        before_data,
        after_data
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
      actor_id,
      actor_email,
      action,
      target_id,
      before_data,
      after_data
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

-- Compatibility view: expose legacy `changes` column for readers still on audit_log.
DROP VIEW IF EXISTS audit_log;
CREATE VIEW audit_log AS
SELECT
  id,
  action,
  target_id AS record_id,
  actor_id AS changed_by,
  actor_email AS user_email,
  before_data AS old_value,
  after_data AS new_value,
  after_data ->> 'override_reason' AS override_reason,
  after_data ->> 'table_name' AS table_name,
  COALESCE(after_data ->> 'policy_number', before_data ->> 'policy_number') AS policy_number,
  created_at AS performed_at,
  created_at,
  COALESCE(after_data -> 'changes', before_data -> 'changes') AS changes
FROM admin_audit_log;
