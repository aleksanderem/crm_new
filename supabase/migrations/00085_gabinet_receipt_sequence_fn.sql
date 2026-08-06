-- Partial unique index so that INSERT ... ON CONFLICT works for the
-- location_id IS NULL case (standard UNIQUE constraints treat each NULL as
-- distinct, so the existing UNIQUE (organization_id, location_id, year)
-- constraint cannot deduplicate null-location rows in an atomic upsert).
CREATE UNIQUE INDEX IF NOT EXISTS gabinet_receipt_sequences_org_year_noloc_idx
  ON gabinet_receipt_sequences (organization_id, year)
  WHERE location_id IS NULL;

-- Atomically returns the next formatted receipt number for the given org,
-- year, and prefix (default "REC").  Uses INSERT ... ON CONFLICT DO UPDATE
-- RETURNING so the counter is incremented in a single round-trip without any
-- application-level locking or read-modify-write race condition.
CREATE OR REPLACE FUNCTION next_gabinet_receipt_number(
  p_org_id TEXT,
  p_year   INT,
  p_prefix TEXT DEFAULT 'REC'
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
    (gen_random_uuid()::TEXT, p_org_id, NULL, p_year, 1, v_ts)
  ON CONFLICT (organization_id, year) WHERE location_id IS NULL
  DO UPDATE SET
    last_number = gabinet_receipt_sequences.last_number + 1,
    updated_at  = v_ts
  RETURNING last_number INTO v_next;

  RETURN p_prefix || '/' || p_year::TEXT || '/' || LPAD(v_next::TEXT, 5, '0');
END;
$$;
