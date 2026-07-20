-- Migration: 00065_gabinet_package_usage_gift
-- Adds gift-package support to gabinet_package_usage:
--   • 'unassigned' status for packages sold as gifts without an existing patient
--   • nullable patient_id (gift packages have no patient until assigned)
--   • voucher code (auto-generated, unique, human-readable like GIFT-AB3X7Y9Z)
--   • optional recipient details (name, phone, email) stored for later lookup

-- 1. Extend the status enum with the new 'unassigned' value
ALTER TYPE gabinet_package_usage_status_enum ADD VALUE IF NOT EXISTS 'unassigned';

-- 2. Allow patient_id to be NULL for gift packages
ALTER TABLE gabinet_package_usage ALTER COLUMN patient_id DROP NOT NULL;

-- 3. Add gift-specific columns
ALTER TABLE gabinet_package_usage
  ADD COLUMN IF NOT EXISTS is_gift               BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS voucher_code          TEXT,
  ADD COLUMN IF NOT EXISTS gift_recipient_name   TEXT,
  ADD COLUMN IF NOT EXISTS gift_recipient_phone  TEXT,
  ADD COLUMN IF NOT EXISTS gift_recipient_email  TEXT;

-- 4. Unique index on voucher_code (partial — only non-NULL values)
--    enables fast lookup by voucher number and prevents duplicates
CREATE UNIQUE INDEX IF NOT EXISTS gabinet_package_usage_voucher_code_idx
  ON gabinet_package_usage (voucher_code)
  WHERE voucher_code IS NOT NULL;

-- 5. Index to list unassigned gift packages quickly
CREATE INDEX IF NOT EXISTS gabinet_package_usage_org_gift_idx
  ON gabinet_package_usage (organization_id, is_gift)
  WHERE is_gift = TRUE;
