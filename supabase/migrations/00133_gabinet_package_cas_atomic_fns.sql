-- Atomic combined CAS-flip + package-entry deduction/return (closes #5239).
--
-- Previously, updateStatus did two separate round-trips:
--   1. UPDATE gabinet_appointment_treatments SET package_deducted = <bool> (CAS)
--   2. deduct_package_entry / return_package_entry RPC
--
-- If the process aborted between the two calls (network fault, server crash),
-- the junction flag and usedCount would diverge: the flag would say "already
-- deducted" but the package usage count would be stale (or vice versa).
--
-- These functions fuse both operations into a single Postgres transaction so
-- the flag flip and the usedCount update are always applied together or not
-- at all.

CREATE OR REPLACE FUNCTION cas_deduct_package_entry(
  p_appointment_id TEXT,
  p_treatment_id   TEXT,
  p_usage_id       TEXT,
  p_variant_id     TEXT,   -- NULL = match any variant for this treatment
  p_now            BIGINT
) RETURNS BOOLEAN           -- TRUE if CAS won and deduction applied, FALSE if already deducted
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows_affected INT;
  v_row           RECORD;
  v_entry         JSONB;
  v_updated_jsonb JSONB;
  v_all_used      BOOLEAN;
BEGIN
  -- Step 1: CAS flip false → true on the junction row.
  -- If package_deducted is already true another caller won the race; exit early.
  UPDATE gabinet_appointment_treatments
  SET    package_deducted = true
  WHERE  appointment_id   = p_appointment_id
    AND  treatment_id     = p_treatment_id
    AND  package_deducted = false;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected = 0 THEN
    RETURN FALSE;
  END IF;

  -- Step 2: Lock the package usage row and increment usedCount.
  -- Uses SELECT FOR UPDATE so concurrent completions on the same package
  -- are serialized here (same guarantee as the standalone deduct_package_entry).
  SELECT * INTO v_row
  FROM gabinet_package_usage
  WHERE id = p_usage_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Package gone or inactive; flag stays true to prevent re-entry.
    RETURN TRUE;
  END IF;

  SELECT elem INTO v_entry
  FROM jsonb_array_elements(v_row.treatments_used) elem
  WHERE elem->>'treatmentId' = p_treatment_id
    AND (p_variant_id IS NULL OR elem->>'variantId' = p_variant_id)
    AND (elem->>'usedCount')::int < (elem->>'totalCount')::int
  LIMIT 1;

  IF NOT FOUND THEN RETURN TRUE; END IF;

  SELECT jsonb_agg(
    CASE
      WHEN elem->>'treatmentId' = p_treatment_id
        AND (p_variant_id IS NULL OR elem->>'variantId' = p_variant_id)
      THEN jsonb_set(elem, '{usedCount}', to_jsonb((elem->>'usedCount')::int + 1))
      ELSE elem
    END
  ) INTO v_updated_jsonb
  FROM jsonb_array_elements(v_row.treatments_used) elem;

  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_updated_jsonb) e
    WHERE (e->>'usedCount')::int < (e->>'totalCount')::int
  ) INTO v_all_used;

  UPDATE gabinet_package_usage
  SET treatments_used = v_updated_jsonb,
      status          = CASE WHEN v_all_used THEN 'completed' ELSE 'active' END,
      updated_at      = p_now
  WHERE id = p_usage_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION cas_return_package_entry(
  p_appointment_id TEXT,
  p_treatment_id   TEXT,
  p_usage_id       TEXT,
  p_variant_id     TEXT,   -- NULL = match any variant for this treatment
  p_now            BIGINT
) RETURNS BOOLEAN           -- TRUE if CAS won and return applied, FALSE if already returned
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows_affected INT;
  v_row           RECORD;
  v_entry         JSONB;
  v_updated_jsonb JSONB;
BEGIN
  -- Step 1: CAS flip true → false on the junction row.
  UPDATE gabinet_appointment_treatments
  SET    package_deducted = false
  WHERE  appointment_id   = p_appointment_id
    AND  treatment_id     = p_treatment_id
    AND  package_deducted = true;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected = 0 THEN
    RETURN FALSE;
  END IF;

  -- Step 2: Lock and decrement usedCount.
  SELECT * INTO v_row
  FROM gabinet_package_usage
  WHERE id = p_usage_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN TRUE; END IF;

  SELECT elem INTO v_entry
  FROM jsonb_array_elements(v_row.treatments_used) elem
  WHERE elem->>'treatmentId' = p_treatment_id
    AND (p_variant_id IS NULL OR elem->>'variantId' = p_variant_id)
    AND (elem->>'usedCount')::int > 0
  LIMIT 1;

  IF NOT FOUND THEN RETURN TRUE; END IF;

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

  RETURN TRUE;
END;
$$;
