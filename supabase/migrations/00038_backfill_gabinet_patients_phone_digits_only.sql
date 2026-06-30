-- Migration 00038: Backfill gabinet_patients.phone to digits-only format (#2508)
--
-- Patients created before #2496 may have formatted phone numbers (e.g.
-- "600-100-200") stored in the phone column.  The duplicate-check guard
-- introduced in #2496 normalises the incoming phone to digits before the
-- equality comparison, so a formatted legacy value will never match and the
-- dedup guard is silently bypassed for those existing rows.
--
-- This migration brings all existing rows in line with the new contract:
--   • strip every non-digit character from phone (mirrors normalizePhone() in
--     convex/gabinet/patients.ts)
--   • set phone to NULL when stripping leaves an empty string
--   • only touches rows that actually contain non-digit characters so that
--     already-normalised rows are left completely unchanged

UPDATE gabinet_patients
SET
  phone      = NULLIF(regexp_replace(phone, '[^0-9]', '', 'g'), ''),
  updated_at = (extract(epoch from now()) * 1000)::bigint
WHERE phone IS NOT NULL
  AND phone ~ '[^0-9]';
