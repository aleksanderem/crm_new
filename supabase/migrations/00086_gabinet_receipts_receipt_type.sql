-- Add receipt_type column to gabinet_receipts (issue #3767).
--
-- Correction receipts (KOR/ prefix) were previously distinguishable only by
-- a negative total_gross or the receipt_number prefix, not a typed column.
-- A receipt_type column makes queries cleaner and prevents mis-classification.

ALTER TABLE gabinet_receipts
  ADD COLUMN IF NOT EXISTS receipt_type TEXT NOT NULL DEFAULT 'original';

ALTER TABLE gabinet_receipts
  DROP CONSTRAINT IF EXISTS gabinet_receipts_receipt_type_check;
ALTER TABLE gabinet_receipts
  ADD CONSTRAINT gabinet_receipts_receipt_type_check
  CHECK (receipt_type IN ('original', 'correction'));

-- Backfill: receipts with a KOR/ prefix are corrections; everything else is original.
UPDATE gabinet_receipts
  SET receipt_type = 'correction'
  WHERE receipt_number LIKE 'KOR/%';

CREATE INDEX IF NOT EXISTS gabinet_receipts_org_type_idx
  ON gabinet_receipts (organization_id, receipt_type);
