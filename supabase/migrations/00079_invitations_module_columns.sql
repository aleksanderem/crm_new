-- Add module-provisioning columns to invitations table.
-- These were present in the Convex schema since #1002 but missing from
-- Supabase, causing the mirror insert in invitations.create to fail silently
-- (PostgreSQL rejected unknown columns). Without these columns, module-aware
-- invitations (e.g. gabinet employee auto-provisioning) were not mirrored to
-- Supabase, so the team-settings page never showed them.

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS module       TEXT,
  ADD COLUMN IF NOT EXISTS module_data  JSONB;
