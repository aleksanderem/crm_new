-- D24: Central template library — extend form_category_enum with Gabinet-specific
-- types and add updated_by to form_templates for "author of last change" display.
--
-- New categories cover document types requested in D24 that had no equivalent:
--   aftercare       — Zalecenia pozabiegowe
--   consent_photo   — Zgoda fotograficzna
--   consent_marketing — Zgoda marketingowa
--   declaration     — Oświadczenie
--
-- updated_by is nullable so all existing rows are unaffected.

ALTER TYPE form_category_enum ADD VALUE IF NOT EXISTS 'aftercare';
ALTER TYPE form_category_enum ADD VALUE IF NOT EXISTS 'consent_photo';
ALTER TYPE form_category_enum ADD VALUE IF NOT EXISTS 'consent_marketing';
ALTER TYPE form_category_enum ADD VALUE IF NOT EXISTS 'declaration';

ALTER TABLE form_templates
  ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(id);
