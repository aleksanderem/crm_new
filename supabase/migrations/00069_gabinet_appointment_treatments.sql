-- Gabinet appointment → treatment(s) junction table (#3360).
--
-- Existing appointments store a single treatment via scalar columns
-- `treatment_id`, `variant_id`, and `price_at_booking` on
-- gabinet_appointments.  The forthcoming multi-treatment model (#3356)
-- requires a junction table so that each appointment can have N treatments.
--
-- This migration:
--   1. Creates gabinet_appointment_treatments.
--   2. Backfills one row per existing appointment that already has a
--      treatment_id set.  The backfilled rows use gen_random_uuid()::text
--      as their IDs (the table is keyed by appointment_id in practice).
--
-- The scalar columns on gabinet_appointments are intentionally left in
-- place so that read paths built before #3356 continue to work during the
-- transition.  Dropping them is a separate cleanup step.

CREATE TABLE IF NOT EXISTS gabinet_appointment_treatments (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id  TEXT NOT NULL REFERENCES gabinet_appointments(id) ON DELETE CASCADE,
  treatment_id    TEXT REFERENCES gabinet_treatments(id) ON DELETE SET NULL,
  variant_id      TEXT REFERENCES gabinet_treatment_variants(id) ON DELETE SET NULL,
  price_at_booking NUMERIC,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS gabinet_appointment_treatments_appointment_idx
  ON gabinet_appointment_treatments (appointment_id);

CREATE INDEX IF NOT EXISTS gabinet_appointment_treatments_org_idx
  ON gabinet_appointment_treatments (organization_id);

CREATE INDEX IF NOT EXISTS gabinet_appointment_treatments_org_treatment_idx
  ON gabinet_appointment_treatments (organization_id, treatment_id);

-- ---------------------------------------------------------------------------
-- RLS: org-scoped access, same pattern as all other gabinet tables.
-- ---------------------------------------------------------------------------

ALTER TABLE gabinet_appointment_treatments ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON gabinet_appointment_treatments
  USING (organization_id = current_org_id());

-- ---------------------------------------------------------------------------
-- Backfill: one row per existing appointment that has treatment_id set.
-- Rows without treatment_id (appointments booked with no specific treatment)
-- are intentionally skipped — they have nothing to migrate.
-- ---------------------------------------------------------------------------

INSERT INTO gabinet_appointment_treatments (
  id,
  organization_id,
  appointment_id,
  treatment_id,
  variant_id,
  price_at_booking,
  sort_order,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid()::text,
  organization_id,
  id,
  treatment_id,
  variant_id,
  price_at_booking,
  0,
  created_at,
  updated_at
FROM gabinet_appointments
WHERE treatment_id IS NOT NULL;
