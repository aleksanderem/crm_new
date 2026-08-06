-- gabinet_receipts: tracks PDF receipts issued for gabinet payments (issue #3739).
--
-- Each row represents one receipt document issued to a patient. It captures all
-- the data required by Polish fiscal law at the time of issuance so that the PDF
-- can be regenerated later (or verified) without joining back to other tables.
--
-- receipt_number: human-readable sequential number in the format
--   REC/YYYY/NNNNN (e.g. REC/2026/00001). Unique per organization.
--
-- items_json: JSON array of line items serialised at issuance time:
--   [{ name, pkwiu, quantity, unitPriceGross, vatRate, netAmount, vatAmount, grossAmount }]
--
-- pdf_storage_id: Convex _storage ID of the PDF file. Null when the PDF has
--   not yet been stored server-side (generated client-side on demand).
--
-- pdf_url: pre-signed or permanent URL derived from pdf_storage_id. Kept as a
--   convenience so clients don't need to call Convex just to download the file.
--
-- fiscal_receipt_id: copied from payments.fiscal_receipt_id when the payment
--   has already been fiscalised — included on the printed PDF for reference.

CREATE TABLE gabinet_receipts (
  id                  TEXT PRIMARY KEY,
  organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_id          TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  appointment_id      TEXT REFERENCES gabinet_appointments(id) ON DELETE SET NULL,
  patient_id          TEXT REFERENCES gabinet_patients(id) ON DELETE SET NULL,
  receipt_number      TEXT NOT NULL,
  issued_at           BIGINT NOT NULL,
  -- Org data captured at issuance time
  organization_name   TEXT NOT NULL,
  organization_nip    TEXT,
  organization_address TEXT,
  -- Amounts in PLN (numeric to avoid floating-point drift)
  total_net           NUMERIC(10, 2) NOT NULL,
  total_vat           NUMERIC(10, 2) NOT NULL,
  total_gross         NUMERIC(10, 2) NOT NULL,
  payment_method      TEXT NOT NULL,
  -- Line items (JSON)
  items_json          TEXT NOT NULL,
  -- Fiscal reference (copied from payment when available)
  fiscal_receipt_id   TEXT,
  -- PDF storage
  pdf_storage_id      TEXT,
  pdf_url             TEXT,
  -- Metadata
  created_by          TEXT NOT NULL REFERENCES users(id),
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL,
  UNIQUE (organization_id, receipt_number)
);

CREATE INDEX gabinet_receipts_org_idx        ON gabinet_receipts (organization_id);
CREATE INDEX gabinet_receipts_payment_idx    ON gabinet_receipts (payment_id);
CREATE INDEX gabinet_receipts_patient_idx    ON gabinet_receipts (patient_id);
CREATE INDEX gabinet_receipts_appointment_idx ON gabinet_receipts (appointment_id);

ALTER TABLE gabinet_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_receipts
  USING (organization_id = current_setting('app.current_org_id', true));
