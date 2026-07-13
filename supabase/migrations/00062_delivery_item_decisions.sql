-- Item decisions for warehouse delivery verification screen (#3055).
--
-- Stores user's per-item decisions from the matching verification UI,
-- separately from analysis_result and matching_proposals.
-- Shape: ItemDecisions { decidedAt: number, items: (ItemDecision | null)[] }
-- where ItemDecision = { type, productId?, createLaterType? }
--
-- Decisions are written by the verification screen and never overwritten by
-- the OCR analysis or matching engine.  Posting the delivery does not require
-- all decisions to be resolved — the UI enforces that constraint.

ALTER TABLE warehouse_deliveries
  ADD COLUMN IF NOT EXISTS item_decisions JSONB;
