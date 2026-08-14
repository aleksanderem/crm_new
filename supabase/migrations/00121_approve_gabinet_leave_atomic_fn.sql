-- Atomic leave approval: update leave status + increment used_days in one
-- Postgres transaction (issue #4771).
--
-- Previously, approveLeave made two separate PostgREST calls: first patching
-- gabinet_leaves.status to "approved", then patching gabinet_leave_balances.
-- used_days. If the second write failed (network blip, constraint violation),
-- the leave was left as "approved" with stale balance — inconsistent state
-- with no automatic recovery path.
--
-- By wrapping both operations in a single plpgsql function they share one
-- transaction: if the balance UPDATE raises an exception, Postgres rolls back
-- the leave status UPDATE automatically.

CREATE OR REPLACE FUNCTION approve_gabinet_leave(
  p_leave_id    TEXT,
  p_org_id      TEXT,
  p_approved_by TEXT,
  p_now         BIGINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id       TEXT;
  v_leave_type_id TEXT;
  v_start_date    TEXT;
  v_end_date      TEXT;
  v_days          NUMERIC;
  v_year          INT;
  v_employee_id   TEXT;
BEGIN
  -- Step 1: approve the leave (verify org ownership via WHERE clause).
  UPDATE gabinet_leaves
  SET
    status      = 'approved',
    approved_by = p_approved_by,
    approved_at = p_now,
    updated_at  = p_now
  WHERE id = p_leave_id
    AND organization_id = p_org_id
  RETURNING user_id, leave_type_id, start_date, end_date
  INTO v_user_id, v_leave_type_id, v_start_date, v_end_date;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave not found or org mismatch: %', p_leave_id;
  END IF;

  -- Step 2: update the leave balance if the leave is typed (has a leaveTypeId).
  IF v_leave_type_id IS NOT NULL THEN
    -- Calculate business days the same way the JS code did:
    -- GREATEST(1, (end_date - start_date) + 1)
    v_days := GREATEST(1, (v_end_date::DATE - v_start_date::DATE) + 1);
    v_year := EXTRACT(YEAR FROM v_start_date::DATE)::INT;

    -- Resolve the employee record for this user in this org.
    SELECT id INTO v_employee_id
    FROM gabinet_employees
    WHERE organization_id = p_org_id
      AND user_id = v_user_id
    LIMIT 1;

    IF v_employee_id IS NOT NULL THEN
      UPDATE gabinet_leave_balances
      SET
        used_days  = used_days + v_days,
        updated_at = p_now
      WHERE organization_id = p_org_id
        AND employee_id    = v_employee_id
        AND leave_type_id  = v_leave_type_id
        AND year           = v_year;
      -- No error if the balance row doesn't exist — matches previous behaviour.
    END IF;
  END IF;
END;
$$;
