-- Extend check_package_overbooking to account for the full series size
-- when booking recurring appointments (closes #5232).
--
-- Previously the function was called once before any insertion with an implicit
-- new_count of 1, so a series of N recurring appointments only checked whether
-- one more slot was available rather than N. The new p_new_count parameter lets
-- the caller pass the total number of appointments about to be inserted so the
-- guard can reject the entire series if there is not enough capacity.

CREATE OR REPLACE FUNCTION check_package_overbooking(
  p_usage_id                          TEXT,
  p_treatment_id                      TEXT,
  p_variant_id                        TEXT,
  p_appointment_package_treatment_id  TEXT,
  p_new_count                         INT DEFAULT 1
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row     RECORD;
  v_entry   JSONB;
  v_used    INT;
  v_total   INT;
  v_pending BIGINT;
BEGIN
  SELECT * INTO v_row
  FROM gabinet_package_usage
  WHERE id = p_usage_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT elem INTO v_entry
  FROM jsonb_array_elements(v_row.treatments_used) elem
  WHERE elem->>'treatmentId' = p_treatment_id
    AND (p_variant_id IS NULL OR elem->>'variantId' = p_variant_id)
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  v_used  := (v_entry->>'usedCount')::int;
  v_total := (v_entry->>'totalCount')::int;

  SELECT COUNT(*) INTO v_pending
  FROM gabinet_appointments
  WHERE package_usage_id = p_usage_id
    AND status IN ('scheduled', 'confirmed', 'in_progress')
    AND package_treatment_id IS NOT DISTINCT FROM p_appointment_package_treatment_id;

  IF v_used + v_pending + p_new_count > v_total THEN
    RAISE EXCEPTION 'package_overbooking: % sessions used/pending + % new out of % total',
      (v_used + v_pending), p_new_count, v_total;
  END IF;
END;
$$;
