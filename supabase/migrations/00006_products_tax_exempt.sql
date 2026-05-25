-- Add native ZW (VAT-exempt) support to products.tax_rate.
--
-- The CRM products form is being switched to the same VAT dropdown used by
-- gabinet treatments (ZW, 0%, 5%, 8%, 23%). Introduce a self-describing
-- tax_exempt boolean and make tax_rate nullable so VAT-exempt products do
-- not have to carry a numeric value. Mirrors 00005_gabinet_treatment_tax_exempt.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN;

ALTER TABLE products
  ALTER COLUMN tax_rate DROP NOT NULL;
