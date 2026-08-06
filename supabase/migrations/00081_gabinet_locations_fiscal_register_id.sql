-- Add fiscal_register_id to gabinet_locations.
-- Multi-location clinics need a per-location fiscal register / POS terminal
-- identifier so that receipt counters remain independent per location.
-- The value is a free-form string (e.g. "KFP1", "POS-02") set by the clinic
-- administrator; uniqueness is not enforced at DB level because identifiers
-- may be assigned by the fiscal device manufacturer and the clinic may have
-- its own numbering scheme.
ALTER TABLE gabinet_locations
  ADD COLUMN IF NOT EXISTS fiscal_register_id TEXT;
