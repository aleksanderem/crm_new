-- gabinet_loyalty_tiers: per-organisation configurable loyalty tier thresholds
CREATE TABLE gabinet_loyalty_tiers (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier            gabinet_loyalty_tier_enum NOT NULL,
  name            TEXT NOT NULL,
  threshold       INTEGER NOT NULL DEFAULT 0,
  color           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,
  UNIQUE (organization_id, tier)
);

CREATE INDEX gabinet_loyalty_tiers_org_idx ON gabinet_loyalty_tiers (organization_id);

ALTER TABLE gabinet_loyalty_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_loyalty_tiers
  USING (organization_id = current_org_id());
