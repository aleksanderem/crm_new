-- Add per-channel and per-timing reminder settings to org_settings (issue #2716)
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS reminder_sms_48h   BOOLEAN,
  ADD COLUMN IF NOT EXISTS reminder_sms_24h   BOOLEAN,
  ADD COLUMN IF NOT EXISTS reminder_email_48h BOOLEAN,
  ADD COLUMN IF NOT EXISTS reminder_email_24h BOOLEAN;

-- Add per-appointment reminder overrides (JSON) to gabinet_appointments (issue #2716)
ALTER TABLE gabinet_appointments
  ADD COLUMN IF NOT EXISTS reminder_overrides TEXT;
