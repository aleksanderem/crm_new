-- Add an optional metadata JSONB column to notifications so type-specific
-- payloads (e.g. refund authorization requests) can carry the data the bell
-- needs for inline approve/reject actions (#1722).

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB;
