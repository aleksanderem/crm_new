-- Add patient_retention_months to org_settings for GDPR auto-anonymization (#3785).
-- When set, the nightly retention cron auto-anonymizes inactive gabinet patients
-- whose updated_at is older than this many months. NULL = disabled.
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS patient_retention_months integer;
