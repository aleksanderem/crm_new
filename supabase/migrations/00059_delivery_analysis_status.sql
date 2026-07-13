-- Invoice analysis status tracking for warehouse deliveries (#3045).
--
-- Adds four columns to warehouse_deliveries to persist the result of
-- AI/OCR invoice analysis run via the analyzeDeliveryInvoice backend action.
--
-- analysis_status lifecycle:
--   NULL          = analysis never run
--   'pending'     = queued for analysis (reserved for future async use)
--   'processing'  = analysis currently in progress
--   'completed'   = analysis succeeded; analysis_result is populated
--   'failed'      = analysis failed; analysis_error holds the reason
--
-- analysis_result stores ParsedInvoice (without rawText) as JSONB.
-- On re-analysis failure the previous successful result is preserved.

ALTER TABLE warehouse_deliveries
  ADD COLUMN IF NOT EXISTS analysis_status       TEXT,
  ADD COLUMN IF NOT EXISTS analysis_result       JSONB,
  ADD COLUMN IF NOT EXISTS analysis_completed_at BIGINT,
  ADD COLUMN IF NOT EXISTS analysis_error        TEXT;

ALTER TABLE warehouse_deliveries
  ADD CONSTRAINT warehouse_deliveries_analysis_status_check
    CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed'));
