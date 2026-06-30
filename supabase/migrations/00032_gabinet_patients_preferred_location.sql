-- Add optional preferred location to gabinet_patients for multi-location orgs.
--
-- Patients are org-scoped (visible across all locations within an org) but in
-- multi-location clinics/salons the care team needs to know which location a
-- patient "belongs to" for scheduling defaults, clinical handoff, and filtering.
-- This mirrors the gabinet_employees.location_id soft-tag pattern (migration
-- 00029) and complements the full gabinet_employee_locations join table (00030).
--
-- Semantics: nullable, no hard constraint. Changing it records a location
-- transfer. NULL means "not assigned to a specific location" (typical for
-- single-location orgs that never configure locations).
ALTER TABLE gabinet_patients
  ADD COLUMN IF NOT EXISTS preferred_location_id TEXT
    REFERENCES gabinet_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gabinet_patients_org_location_idx
  ON gabinet_patients (organization_id, preferred_location_id)
  WHERE preferred_location_id IS NOT NULL;
