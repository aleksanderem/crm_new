-- Migration 00039: Add sms_consent column and partial index to gabinet_patients (#2512)
--
-- Adds an opt-in SMS marketing-consent flag to patients.  When the org wants to
-- send bulk SMS messages it needs to filter to patients who have explicitly
-- consented; a partial index covering only consenting rows (sms_consent = true)
-- keeps that query efficient even at large patient counts.
--
-- The column is nullable rather than NOT NULL DEFAULT false so that existing rows
-- remain distinguishable from patients who actively declined consent (NULL =
-- consent never asked; false = asked and declined; true = consented).

ALTER TABLE gabinet_patients
  ADD COLUMN sms_consent BOOLEAN;

CREATE INDEX gabinet_patients_org_sms_consent_idx
  ON gabinet_patients (organization_id)
  WHERE sms_consent = true;
