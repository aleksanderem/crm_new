-- Add tag_ids and category_id to gabinet_treatment_packages
-- These columns enable the tags/categories system already used by treatments, patients,
-- employees, and appointments to be applied to packages as well.

ALTER TABLE gabinet_treatment_packages
  ADD COLUMN IF NOT EXISTS tag_ids     TEXT[]  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS category_id TEXT    DEFAULT NULL;

CREATE INDEX IF NOT EXISTS gabinet_treatment_packages_category_id_idx
  ON gabinet_treatment_packages (category_id)
  WHERE category_id IS NOT NULL;
