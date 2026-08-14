-- Atomic leave deletion: balance rollback + row delete in one Postgres transaction
-- (issue #4783 — same non-atomic pattern as approveLeave/#4771 and rejectLeave/#4782).
--
-- deleteLeave previously made two separate PostgREST calls for approved leaves:
-- first decrementing gabinet_leave_balances.used_days, then deleting the
-- gabinet_leaves row.  If the delete failed after the balance patch the employee's
-- balance was permanently wrong with no recovery path.
--
-- By wrapping both operations in a single plpgsql function they share one
-- transaction: if the DELETE raises an exception, Postgres rolls back the
-- balance UPDATE automatically.
--
-- Day calculation mirrors reject_gabinet_leave (00123): proportional fraction
-- for partial-day leaves (start_time/end_time set), GREATEST(1, date_diff+1)
-- for full-day leaves.

CREATE OR REPLACE FUNCTION delete_gabinet_leave(
  p_leave_id TEXT,
  p_org_id   TEXT,
  p_now      BIGINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prev_status   TEXT;
  v_user_id       TEXT;
  v_leave_type_id TEXT;
  v_start_date    TEXT;
  v_end_date      TEXT;
  v_start_time    TEXT;
  v_end_time      TEXT;
  v_days          NUMERIC;
  v_year          INT;
  v_employee_id   TEXT;
  v_start_minutes INT;
  v_end_minutes   INT;
BEGIN
  -- Step 1: capture leave state before deletion.
  SELECT status, user_id, leave_type_id, start_date, end_date, start_time, end_time
  INTO v_prev_status, v_user_id, v_leave_type_id, v_start_date, v_end_date, v_start_time, v_end_time
  FROM gabinet_leaves
  WHERE id = p_leave_id
    AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave not found or org mismatch: %', p_leave_id;
  END IF;

  -- Step 2: delete the leave row.
  DELETE FROM gabinet_leaves
  WHERE id = p_leave_id
    AND organization_id = p_org_id;

  -- Step 3: roll back the balance deduction only when the leave was approved.
  IF v_prev_status = 'approved' AND v_leave_type_id IS NOT NULL THEN
    IF v_start_time IS NOT NULL AND v_end_time IS NOT NULL THEN
      -- Partial-day leave: proportional fraction of a standard 8-hour day (480 min).
      v_start_minutes := (SPLIT_PART(v_start_time, ':', 1)::INT * 60)
                       + SPLIT_PART(v_start_time, ':', 2)::INT;
      v_end_minutes   := (SPLIT_PART(v_end_time,   ':', 1)::INT * 60)
                       + SPLIT_PART(v_end_time,   ':', 2)::INT;
      v_days := GREATEST(0, (v_end_minutes - v_start_minutes)::NUMERIC / 480);
    ELSE
      -- Full-day leave: GREATEST(1, (end_date - start_date) + 1).
      v_days := GREATEST(1, (v_end_date::DATE - v_start_date::DATE) + 1);
    END IF;

    v_year := EXTRACT(YEAR FROM v_start_date::DATE)::INT;

    SELECT id INTO v_employee_id
    FROM gabinet_employees
    WHERE organization_id = p_org_id
      AND user_id = v_user_id
    LIMIT 1;

    IF v_employee_id IS NOT NULL THEN
      UPDATE gabinet_leave_balances
      SET
        used_days  = GREATEST(0, used_days - v_days),
        updated_at = p_now
      WHERE organization_id = p_org_id
        AND employee_id    = v_employee_id
        AND leave_type_id  = v_leave_type_id
        AND year           = v_year;
      -- No error if the balance row doesn't exist — matches approve/reject behaviour.
    END IF;
  END IF;
END;
$$;
