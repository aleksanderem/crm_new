-- Allow hard-deleting treatments (closes #3549).
--
-- gabinet_treatment_packages.auto_generated_for_treatment_id currently has no
-- ON DELETE clause (defaults to NO ACTION), which prevents deleting a treatment
-- that was used to auto-generate a package.  The column is nullable so SET NULL
-- is the right semantic: the package survives the treatment deletion with its
-- reference cleared.

ALTER TABLE gabinet_treatment_packages
  DROP CONSTRAINT IF EXISTS gabinet_treatment_packages_auto_generated_for_treatment_id_fkey;

ALTER TABLE gabinet_treatment_packages
  ADD CONSTRAINT gabinet_treatment_packages_auto_generated_for_treatment_id_fkey
  FOREIGN KEY (auto_generated_for_treatment_id)
  REFERENCES gabinet_treatments(id)
  ON DELETE SET NULL;
