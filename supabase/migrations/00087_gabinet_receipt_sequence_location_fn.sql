-- Location-aware receipt sequence function for multi-location orgs (issue #3770).
--
-- The existing next_gabinet_receipt_number function (migration 00085) only
-- handles location_id IS NULL via the partial unique index
-- gabinet_receipt_sequences_org_year_noloc_idx.  For orgs with multiple
-- locations, each location needs its own independent counter so that receipt
-- numbers are sequential within each location (e.g. LOC-A gets REC/2026/00001
-- through REC/2026/00042, LOC-B gets its own REC/2026/00001 etc.).
--
-- For non-null location_id, the regular UNIQUE (organization_id, location_id,
-- year) constraint on gabinet_receipt_sequences already guarantees uniqueness
-- (standard equality comparison works for non-null values), so ON CONFLICT
-- (organization_id, location_id, year) works correctly without a separate
-- partial index.
CREATE OR REPLACE FUNCTION next_gabinet_receipt_number_for_location(
  p_org_id      TEXT,
  p_year        INT,
  p_location_id TEXT,
  p_prefix      TEXT DEFAULT 'REC'
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next BIGINT;
  v_ts   BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
BEGIN
  INSERT INTO gabinet_receipt_sequences
    (id, organization_id, location_id, year, last_number, updated_at)
  VALUES
    (gen_random_uuid()::TEXT, p_org_id, p_location_id, p_year, 1, v_ts)
  ON CONFLICT (organization_id, location_id, year)
  DO UPDATE SET
    last_number = gabinet_receipt_sequences.last_number + 1,
    updated_at  = v_ts
  RETURNING last_number INTO v_next;

  RETURN p_prefix || '/' || p_year::TEXT || '/' || LPAD(v_next::TEXT, 5, '0');
END;
$$;
