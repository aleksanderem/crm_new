-- Migration 00034: Location-scoped RLS for gabinet_appointments (#2462)
--
-- Replaces the broad org-scoped SELECT policy on gabinet_appointments with one
-- that also enforces location-level visibility for gabinet employees.
--
-- Motivation: the gabinet_employee_locations join table (migration 00030) was
-- introduced precisely so future RLS policies could scope appointment access to
-- the locations an employee is authorized to work at.
--
-- Access model for SELECT:
--   1. Service role (Convex backend): always allowed — bypass.
--   2. Appointment has no location (location_id IS NULL): visible to every org
--      member.  Unscoped appointments are org-wide.
--   3. Org owner or admin: bypass location scoping — managers need the full
--      schedule view regardless of employee assignments.
--   4. Org member who is NOT a registered gabinet_employee: bypass — front-desk
--      staff, accountants, and other non-clinical users in the org are not
--      constrained to locations.
--   5. Gabinet employee: can only see appointments whose location_id appears in
--      their gabinet_employee_locations authorisation set.
--
-- INSERT / UPDATE / DELETE policies remain org-scoped (defined in 00002) because
-- write-side location enforcement is handled at the application layer (Convex
-- mutations validate employee location assignment before writing).

DROP POLICY IF EXISTS gabinet_appointments_select ON gabinet_appointments;

CREATE POLICY gabinet_appointments_select ON gabinet_appointments
  FOR SELECT USING (
    current_org_id() = organization_id
    AND (
      -- 1. Backend service role always bypasses
      is_service_role()

      -- 2. Appointments with no location are org-wide
      OR location_id IS NULL

      -- 3. Org owners and admins see all appointments
      OR EXISTS (
        SELECT 1 FROM team_memberships tm
        WHERE tm.user_id    = current_user_id()
          AND tm.organization_id = current_org_id()
          AND tm.role IN ('owner', 'admin')
      )

      -- 4. Users without a gabinet_employee record see all appointments
      OR NOT EXISTS (
        SELECT 1 FROM gabinet_employees ge
        WHERE ge.user_id        = current_user_id()
          AND ge.organization_id = current_org_id()
      )

      -- 5. Gabinet employees can see appointments at their authorised locations
      OR EXISTS (
        SELECT 1
        FROM gabinet_employees ge
        JOIN gabinet_employee_locations gel ON gel.employee_id = ge.id
        WHERE ge.user_id        = current_user_id()
          AND ge.organization_id = current_org_id()
          AND gel.location_id    = gabinet_appointments.location_id
      )
    )
  );
