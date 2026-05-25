-- Migrate gabinet_treatments.tax_rate to native ZW (VAT-exempt) support.
--
-- Previously the app stored ZW ("zwolniony") as the magic value -1 in the
-- numeric tax_rate column. This migration introduces a self-describing
-- tax_exempt boolean and clears the sentinel from tax_rate.

ALTER TABLE gabinet_treatments
  ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN;

UPDATE gabinet_treatments
  SET tax_exempt = TRUE,
      tax_rate = NULL
  WHERE tax_rate = -1;
