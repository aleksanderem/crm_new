-- Overbooking guard for package-linked appointments (closes #5227).
--
-- The session counter (usedCount) in gabinet_package_usage.treatments_used is
-- decremented only when an appointment reaches "completed". Without a guard at
-- booking time a practitioner can create more appointments than the package has
-- remaining sessions, causing the later deductions to silently fail.
--
-- This function is called from gabinet/appointments.create before inserting the
-- new row. It acquires a row-level lock on gabinet_package_usage, counts
-- non-terminal appointments (scheduled/confirmed/in_progress) already booked
-- against the same package+treatment slot, and raises an error if adding one
-- more booking would exceed totalCount.
--
-- p_appointment_package_treatment_id mirrors the value that will be stored in
-- gabinet_appointments.package_treatment_id. When NULL (simple single-treatment
-- booking) all pending appointments for this package are counted; when non-NULL
-- only appointments with the matching package_treatment_id are counted.

CREATE OR REPLACE FUNCTION check_package_overbooking(
  p_usage_id                          TEXT,
  p_treatment_id                      TEXT,   -- entry in treatments_used to check
  p_variant_id                        TEXT,   -- NULL = match any variant
  p_appointment_package_treatment_id  TEXT    -- NULL for simple appointments
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
  -- Lock the usage row so concurrent creates for the same package+treatment
  -- slot are serialised here, not at deduction time.
  SELECT * INTO v_row
  FROM gabinet_package_usage
  WHERE id = p_usage_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  -- Locate the relevant entry in the JSONB array.
  SELECT elem INTO v_entry
  FROM jsonb_array_elements(v_row.treatments_used) elem
  WHERE elem->>'treatmentId' = p_treatment_id
    AND (p_variant_id IS NULL OR elem->>'variantId' = p_variant_id)
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  v_used  := (v_entry->>'usedCount')::int;
  v_total := (v_entry->>'totalCount')::int;

  -- Count non-terminal appointments already booked against this package slot.
  -- IS NOT DISTINCT FROM handles NULL equality (NULL = NULL is TRUE).
  SELECT COUNT(*) INTO v_pending
  FROM gabinet_appointments
  WHERE package_usage_id = p_usage_id
    AND status IN ('scheduled', 'confirmed', 'in_progress')
    AND package_treatment_id IS NOT DISTINCT FROM p_appointment_package_treatment_id;

  IF v_used + v_pending >= v_total THEN
    RAISE EXCEPTION 'package_overbooking: % sessions used/pending out of % total',
      (v_used + v_pending), v_total;
  END IF;
END;
$$;
