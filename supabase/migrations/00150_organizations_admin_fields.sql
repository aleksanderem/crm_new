-- Platform Admin SP2: operator-managed org fields.
-- status: absent/'active' = normal; 'suspended' blocks the tenant (auth + JWT mint).
-- suspended_reason: operator note shown in console + audit.
-- seat_limit_override: manual seat cap, participates in the "max wins" seat limit.
-- All nullable/idempotent — existing rows read as active with no override.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS seat_limit_override integer;
