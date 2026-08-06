-- Atomic receipt insert: increment sequence counter + insert row in one
-- Postgres transaction (issue #3793).
--
-- Previously, calling next_gabinet_receipt_number* from application code
-- consumed a sequence number before the subsequent ctx.storage.store or
-- db.insert — if either failed, the counter was left incremented with no
-- receipt row, producing a gap in the legally-required sequential numbering.
--
-- By wrapping both operations in a single plpgsql function they share one
-- transaction: if the INSERT raises an exception, Postgres rolls back the
-- UPDATE inside next_gabinet_receipt_number* automatically — no gap is
-- created.
--
-- Returns one row: (receipt_id TEXT, receipt_number TEXT).

CREATE OR REPLACE FUNCTION insert_gabinet_receipt_with_number(
  p_org_id              TEXT,
  p_year                INT,
  p_prefix              TEXT,
  p_location_id         TEXT,        -- NULL for orgs without multi-location
  p_payment_id          TEXT,
  p_appointment_id      TEXT,        -- NULL allowed
  p_patient_id          TEXT,        -- NULL allowed
  p_issued_at           BIGINT,
  p_organization_name   TEXT,
  p_organization_nip    TEXT,        -- NULL allowed
  p_organization_address TEXT,       -- NULL allowed
  p_total_net           NUMERIC,
  p_total_vat           NUMERIC,
  p_total_gross         NUMERIC,
  p_payment_method      TEXT,
  p_items_json          TEXT,
  p_fiscal_receipt_id   TEXT,        -- NULL allowed
  p_receipt_type        TEXT,
  p_pdf_storage_id      TEXT,        -- NULL allowed
  p_pdf_url             TEXT,        -- NULL allowed
  p_created_by          TEXT,
  p_now                 BIGINT
) RETURNS TABLE (receipt_id TEXT, receipt_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_number TEXT;
  v_id     TEXT := gen_random_uuid()::TEXT;
BEGIN
  -- Step 1: atomically increment the sequence counter.
  -- The sub-functions (next_gabinet_receipt_number*) run within this same
  -- transaction, so the UPDATE to gabinet_receipt_sequences is rolled back
  -- together with the INSERT below if anything fails.
  IF p_location_id IS NOT NULL THEN
    v_number := next_gabinet_receipt_number_for_location(
      p_org_id, p_year, p_location_id, p_prefix
    );
  ELSE
    v_number := next_gabinet_receipt_number(p_org_id, p_year, p_prefix);
  END IF;

  -- Step 2: insert the receipt row in the same transaction.
  INSERT INTO gabinet_receipts (
    id,                  organization_id,      payment_id,
    appointment_id,      patient_id,           receipt_number,
    issued_at,           organization_name,    organization_nip,
    organization_address, total_net,           total_vat,
    total_gross,         payment_method,       items_json,
    fiscal_receipt_id,   receipt_type,         pdf_storage_id,
    pdf_url,             created_by,           created_at,
    updated_at,          location_id,          status
  ) VALUES (
    v_id,                p_org_id,             p_payment_id,
    p_appointment_id,    p_patient_id,         v_number,
    p_issued_at,         p_organization_name,  p_organization_nip,
    p_organization_address, p_total_net,       p_total_vat,
    p_total_gross,       p_payment_method,     p_items_json,
    p_fiscal_receipt_id, p_receipt_type,       p_pdf_storage_id,
    p_pdf_url,           p_created_by,         p_now,
    p_now,               p_location_id,        'issued'
  );

  RETURN QUERY SELECT v_id, v_number;
END;
$$;
