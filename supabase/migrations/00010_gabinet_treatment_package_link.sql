-- Link a treatment to an existing treatment package.
--
-- Issue #1525 — the treatment add form now exposes a dropdown of packages
-- from the "Pakiety" tab when the "Ten zabieg to pakiet" checkbox is on,
-- instead of asking for a free-form session count. The selected package id
-- is persisted here.

ALTER TABLE gabinet_treatments
  ADD COLUMN IF NOT EXISTS package_id TEXT REFERENCES gabinet_treatment_packages(id);

CREATE INDEX IF NOT EXISTS gabinet_treatments_org_package_idx
  ON gabinet_treatments (organization_id, package_id);
