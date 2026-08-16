-- Atomic package entry deduction/return via SELECT FOR UPDATE (closes #5208).
--
-- The old application-side read-modify-write on `treatments_used` JSONB had a
-- race: two concurrent appointment completions sharing the same `packageUsageId`
-- could both read the same `usedCount`, both increment it, and the second writer
-- would overwrite the first's increment, losing one deduction.
--
-- These functions serialize concurrent callers on the row lock so the increment
-- (or decrement) is applied exactly once per caller.

CREATE OR REPLACE FUNCTION deduct_package_entry(
  p_usage_id     TEXT,
  p_treatment_id TEXT,
  p_variant_id   TEXT,   -- NULL = match any variant for this treatment
  p_now          BIGINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row           RECORD;
  v_updated_jsonb JSONB;
  v_entry         JSONB;
  v_all_used      BOOLEAN;
BEGIN
  -- Lock the row; concurrent callers block here and see the updated usedCount
  -- from the previous winner once they acquire the lock.
  SELECT * INTO v_row
  FROM gabinet_package_usage
  WHERE id = p_usage_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  -- Re-check that a matching entry still has remaining sessions after the lock.
  SELECT elem INTO v_entry
  FROM jsonb_array_elements(v_row.treatments_used) elem
  WHERE elem->>'treatmentId' = p_treatment_id
    AND (p_variant_id IS NULL OR elem->>'variantId' = p_variant_id)
    AND (elem->>'usedCount')::int < (elem->>'totalCount')::int
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  -- Increment usedCount on every matching entry (mirrors JS .map() behaviour).
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'treatmentId' = p_treatment_id
        AND (p_variant_id IS NULL OR elem->>'variantId' = p_variant_id)
      THEN jsonb_set(elem, '{usedCount}', to_jsonb((elem->>'usedCount')::int + 1))
      ELSE elem
    END
  ) INTO v_updated_jsonb
  FROM jsonb_array_elements(v_row.treatments_used) elem;

  -- Mark the package completed when every entry is fully used.
  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_updated_jsonb) e
    WHERE (e->>'usedCount')::int < (e->>'totalCount')::int
  ) INTO v_all_used;

  UPDATE gabinet_package_usage
  SET treatments_used = v_updated_jsonb,
      status          = CASE WHEN v_all_used THEN 'completed' ELSE 'active' END,
      updated_at      = p_now
  WHERE id = p_usage_id;
END;
$$;

CREATE OR REPLACE FUNCTION return_package_entry(
  p_usage_id     TEXT,
  p_treatment_id TEXT,
  p_variant_id   TEXT,   -- NULL = match any variant for this treatment
  p_now          BIGINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row           RECORD;
  v_updated_jsonb JSONB;
  v_entry         JSONB;
BEGIN
  SELECT * INTO v_row
  FROM gabinet_package_usage
  WHERE id = p_usage_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  -- Early-exit if there is nothing to return.
  SELECT elem INTO v_entry
  FROM jsonb_array_elements(v_row.treatments_used) elem
  WHERE elem->>'treatmentId' = p_treatment_id
    AND (p_variant_id IS NULL OR elem->>'variantId' = p_variant_id)
    AND (elem->>'usedCount')::int > 0
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  -- Decrement usedCount on every matching entry (mirrors JS .map() + GREATEST(0, …) behaviour).
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'treatmentId' = p_treatment_id
        AND (p_variant_id IS NULL OR elem->>'variantId' = p_variant_id)
      THEN jsonb_set(elem, '{usedCount}', to_jsonb(GREATEST(0, (elem->>'usedCount')::int - 1)))
      ELSE elem
    END
  ) INTO v_updated_jsonb
  FROM jsonb_array_elements(v_row.treatments_used) elem;

  UPDATE gabinet_package_usage
  SET treatments_used = v_updated_jsonb,
      status          = CASE WHEN v_row.status = 'completed' THEN 'active' ELSE v_row.status END,
      updated_at      = p_now
  WHERE id = p_usage_id;
END;
$$;
