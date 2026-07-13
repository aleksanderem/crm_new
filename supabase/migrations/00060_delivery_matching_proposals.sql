-- Matching proposals for warehouse delivery invoice items (#3050).
--
-- Stores the result of matchDeliveryItems as JSONB alongside the delivery.
-- Shape: MatchingProposals { matchedAt: number, items: ItemMatchResult[] }
--
-- This column is auxiliary data for the future verification screen.
-- It is overwritten on each re-run of matching; it never replaces
-- analysis_result or affects posted deliveries or stock movements.

ALTER TABLE warehouse_deliveries
  ADD COLUMN IF NOT EXISTS matching_proposals JSONB;
