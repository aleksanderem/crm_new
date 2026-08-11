-- Waitlist table for gabinet module (issue #4166).
-- Patients can be placed on a waitlist when no immediate slot is available.
-- Supports optional treatment/employee preference, flexible preferred-date and
-- preferred-time arrays, priority ordering, and notification tracking.

CREATE TABLE IF NOT EXISTS gabinet_waitlist (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id        TEXT NOT NULL REFERENCES gabinet_patients(id) ON DELETE CASCADE,
  treatment_id      TEXT REFERENCES gabinet_treatments(id) ON DELETE SET NULL,
  employee_id       TEXT REFERENCES gabinet_employees(id) ON DELETE SET NULL,
  preferred_dates   JSONB,    -- type:string[] array of YYYY-MM-DD strings
  preferred_times   JSONB,    -- type:string[] array of HH:MM strings
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting', 'notified', 'booked', 'cancelled', 'expired')),
  notified_at       BIGINT,
  priority          INTEGER NOT NULL DEFAULT 0,
  created_by        TEXT NOT NULL REFERENCES users(id),
  created_at        BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS gabinet_waitlist_org_idx
  ON gabinet_waitlist (organization_id);
CREATE INDEX IF NOT EXISTS gabinet_waitlist_org_status_idx
  ON gabinet_waitlist (organization_id, status);
CREATE INDEX IF NOT EXISTS gabinet_waitlist_org_patient_idx
  ON gabinet_waitlist (organization_id, patient_id);
CREATE INDEX IF NOT EXISTS gabinet_waitlist_org_priority_idx
  ON gabinet_waitlist (organization_id, priority);

ALTER TABLE gabinet_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY gabinet_waitlist_select ON gabinet_waitlist
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_waitlist_insert ON gabinet_waitlist
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_waitlist_update ON gabinet_waitlist
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_waitlist_delete ON gabinet_waitlist
  FOR DELETE USING (current_org_id() = organization_id);
