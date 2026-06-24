-- Add 'gratis' and 'barter' to payment_method_enum.
--
-- Business context: visits may be settled as a free-of-charge ("gratis")
-- correction/complaint/gift/promo, or as a non-cash "barter" (e.g. an
-- Instagram collaboration / service exchange). Both need to be a distinct,
-- separately-reportable settlement type rather than reusing 'other'.
--
-- This migration ONLY makes the two values storable. It does NOT implement
-- any of the business rules (gratis = 0 PLN, no split, no credit, mandatory
-- reason; barter not partial, mandatory description; exclusion from turnover
-- and separate barter reporting). Those are application-layer concerns and
-- are handled separately:
--   - convex/payments.ts (paymentMethodValidator)
--   - convex/schema/crm.ts (payments.paymentMethod)
--   - frontend selectors, split/credit guards, and reporting logic
-- Until those land, these enum values are inert (the write path rejects them).
--
-- Adding enum values is additive, non-destructive and idempotent. Same proven
-- pattern as migration 00009 which added 'package'. On PostgreSQL 15 this is
-- safe; the only ALTER TYPE ... ADD VALUE caveat (a freshly added value cannot
-- be used in the same transaction) does not apply here as we only add values.

ALTER TYPE payment_method_enum ADD VALUE IF NOT EXISTS 'gratis';
ALTER TYPE payment_method_enum ADD VALUE IF NOT EXISTS 'barter';
