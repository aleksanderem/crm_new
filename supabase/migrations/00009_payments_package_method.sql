-- Add 'package' to the payment_method_enum (issue #1508).
--
-- Visits booked from a treatment package (gabinetPackageUsage) are already
-- covered by the package purchase, so the patient doesn't pay again per
-- visit. Staff need a payment method that records "settled by package" on
-- the per-visit payment row without booking a new cash/card/transfer leg.

ALTER TYPE payment_method_enum ADD VALUE IF NOT EXISTS 'package';
