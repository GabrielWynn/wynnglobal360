-- ============================================================
-- 20261001174507_commission_merge_atomic.sql
-- merge_commission_records(): survivor update + retirement of the absorbed
-- rows in one transaction, so a merge can never be half-applied.
-- ============================================================

CREATE OR REPLACE FUNCTION public.merge_commission_records(
  p_survivor_id  UUID,
  p_absorbed_ids UUID[],
  p_update       JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_now  TIMESTAMPTZ := now();
  v_live INT;
  n      commission_records;
BEGIN
  IF p_absorbed_ids IS NULL OR cardinality(p_absorbed_ids) = 0 THEN
    RAISE EXCEPTION 'No records to merge';
  END IF;
  IF p_survivor_id = ANY (p_absorbed_ids) THEN
    RAISE EXCEPTION 'The survivor cannot also be merged away';
  END IF;
  IF NOT (p_update ?& ARRAY['status', 'transaction_date', 'merge_source_ids']) THEN
    RAISE EXCEPTION 'Merge update is missing required fields';
  END IF;

  -- Lock the whole group, then make sure none of it was deleted or merged
  -- between the API reading the rows and this call.
  PERFORM 1 FROM commission_records
   WHERE id = p_survivor_id OR id = ANY (p_absorbed_ids)
   ORDER BY id
     FOR UPDATE;

  SELECT count(*) INTO v_live
    FROM commission_records
   WHERE (id = p_survivor_id OR id = ANY (p_absorbed_ids))
     AND NOT COALESCE(is_deleted, FALSE)
     AND merged_into_id IS NULL;

  IF v_live <> cardinality(p_absorbed_ids) + 1 THEN
    RAISE EXCEPTION 'One or more selected records were changed or already merged — reload and try again';
  END IF;

  n := jsonb_populate_record(NULL::commission_records, p_update);

  -- Fields present in p_update are written (a JSON null clears the column);
  -- absent fields keep the survivor's value ("merge without changing amounts").
  UPDATE commission_records c SET
    status              = n.status,
    transaction_date    = n.transaction_date,
    commencement_date   = n.commencement_date,
    commission_type     = n.commission_type,
    notes               = n.notes,
    ifa_notes           = n.ifa_notes,
    merge_source_ids    = n.merge_source_ids,
    amount              = CASE WHEN p_update ? 'amount'              THEN n.amount              ELSE c.amount              END,
    variable_amount     = CASE WHEN p_update ? 'variable_amount'     THEN n.variable_amount     ELSE c.variable_amount     END,
    paid                = CASE WHEN p_update ? 'paid'                THEN n.paid                ELSE c.paid                END,
    ape                 = CASE WHEN p_update ? 'ape'                 THEN n.ape                 ELSE c.ape                 END,
    ape_wgi             = CASE WHEN p_update ? 'ape_wgi'             THEN n.ape_wgi             ELSE c.ape_wgi             END,
    due_wg              = CASE WHEN p_update ? 'due_wg'              THEN n.due_wg              ELSE c.due_wg              END,
    ifa_percentage      = CASE WHEN p_update ? 'ifa_percentage'      THEN n.ifa_percentage      ELSE c.ifa_percentage      END,
    suspense_percentage = CASE WHEN p_update ? 'suspense_percentage' THEN n.suspense_percentage ELSE c.suspense_percentage END,
    wgi_percentage      = CASE WHEN p_update ? 'wgi_percentage'      THEN n.wgi_percentage      ELSE c.wgi_percentage      END,
    pending_percentage  = CASE WHEN p_update ? 'pending_percentage'  THEN n.pending_percentage  ELSE c.pending_percentage  END,
    rate                = CASE WHEN p_update ? 'rate'                THEN n.rate                ELSE c.rate                END,
    updated_at          = v_now
  WHERE c.id = p_survivor_id;

  UPDATE commission_records SET
    is_deleted     = TRUE,
    merged_into_id = p_survivor_id,
    merged_at      = v_now,
    updated_at     = v_now
  WHERE id = ANY (p_absorbed_ids);
END;
$$;

-- Admin API only (service role); never callable from the browser.
REVOKE ALL ON FUNCTION public.merge_commission_records(UUID, UUID[], JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_commission_records(UUID, UUID[], JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
