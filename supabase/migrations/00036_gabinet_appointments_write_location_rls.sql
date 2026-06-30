-- Migration 00036: Location-scoped WITH CHECK for gabinet_appointments INSERT/UPDATE (#2469)
--
-- Migration 00034 replaced the SELECT policy with a location-aware one but left
-- the INSERT and UPDATE policies as plain org-scoped checks from 00002.  This
-- migration replaces both write-side policies so the database itself rejects
-- out-of-scope writes from any client, not just the Convex mutation layer.
--
-- Access model (mirrors the SELECT policy from 00034):
--   1. Service role (Convex backend): always allowed — bypass.
--   2. Appointment has no location (location_id IS NULL): any org member may write.
--   3. Org owner or admin: bypass location scoping.
--   4. Org member who is NOT a registered gabinet_employee: bypass — non-clinical
--      staff (front-desk, accountants) are not constrained by location.
--   5. Gabinet employee: may only write appointments whose location_id appears in
--      their gabinet_employee_locations authorisation set.
--
-- For UPDATE both the USING clause (governs which existing rows can be targeted)
-- and the WITH CHECK clause (governs the resulting state of the row) apply the
-- same location predicate, preventing an employee from both targeting an out-of-
-- scope appointment and from re-assigning an appointment to an out-of-scope location.

DROP POLICY IF EXISTS gabinet_appointments_insert ON gabinet_appointments;
DROP POLICY IF EXISTS gabinet_appointments_update ON gabinet_appointments;

-- Shared predicate factored out as a comment for readability; repeated in both
-- policies below because Postgres does not support policy-level macros.

CREATE POLICY gabinet_appointments_insert ON gabinet_appointments
  FOR INSERT WITH CHECK (
    current_org_id() = organization_id
    AND (
      -- 1. Backend service role always bypasses
      is_service_role()

      -- 2. Appointments with no location are org-wide
      OR location_id IS NULL

      -- 3. Org owners and admins may write to all locations
      OR EXISTS (
        SELECT 1 FROM team_memberships tm
        WHERE tm.user_id        = current_user_id()
          AND tm.organization_id = current_org_id()
          AND tm.role IN ('owner', 'admin')
      )

      -- 4. Users without a gabinet_employee record may write to all locations
      OR NOT EXISTS (
        SELECT 1 FROM gabinet_employees ge
        WHERE ge.user_id        = current_user_id()
          AND ge.organization_id = current_org_id()
      )

      -- 5. Gabinet employees may only write to their authorised locations
      OR EXISTS (
        SELECT 1
        FROM gabinet_employees ge
        JOIN gabinet_employee_locations gel ON gel.employee_id = ge.id
        WHERE ge.user_id        = current_user_id()
          AND ge.organization_id = current_org_id()
          AND gel.location_id    = location_id
      )
    )
  );

CREATE POLICY gabinet_appointments_update ON gabinet_appointments
  FOR UPDATE
  -- USING: which existing rows the current user may target
  USING (
    current_org_id() = organization_id
    AND (
      is_service_role()
      OR location_id IS NULL
      OR EXISTS (
        SELECT 1 FROM team_memberships tm
        WHERE tm.user_id        = current_user_id()
          AND tm.organization_id = current_org_id()
          AND tm.role IN ('owner', 'admin')
      )
      OR NOT EXISTS (
        SELECT 1 FROM gabinet_employees ge
        WHERE ge.user_id        = current_user_id()
          AND ge.organization_id = current_org_id()
      )
      OR EXISTS (
        SELECT 1
        FROM gabinet_employees ge
        JOIN gabinet_employee_locations gel ON gel.employee_id = ge.id
        WHERE ge.user_id        = current_user_id()
          AND ge.organization_id = current_org_id()
          AND gel.location_id    = location_id
      )
    )
  )
  -- WITH CHECK: the resulting row state must also satisfy location scoping
  WITH CHECK (
    current_org_id() = organization_id
    AND (
      is_service_role()
      OR location_id IS NULL
      OR EXISTS (
        SELECT 1 FROM team_memberships tm
        WHERE tm.user_id        = current_user_id()
          AND tm.organization_id = current_org_id()
          AND tm.role IN ('owner', 'admin')
      )
      OR NOT EXISTS (
        SELECT 1 FROM gabinet_employees ge
        WHERE ge.user_id        = current_user_id()
          AND ge.organization_id = current_org_id()
      )
      OR EXISTS (
        SELECT 1
        FROM gabinet_employees ge
        JOIN gabinet_employee_locations gel ON gel.employee_id = ge.id
        WHERE ge.user_id        = current_user_id()
          AND ge.organization_id = current_org_id()
          AND gel.location_id    = location_id
      )
    )
  );
