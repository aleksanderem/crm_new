-- Add variant_id to gabinet_appointments so a specific treatment variant
-- (e.g. a named variant of the same base treatment) can be recorded
-- per appointment. Nullable because existing appointments have no variant.
-- Closes #2851.

ALTER TABLE gabinet_appointments
  ADD COLUMN variant_id TEXT REFERENCES gabinet_treatment_variants(id) ON DELETE SET NULL;
