-- Invoice document pages attached to warehouse deliveries (#3016).
--
-- Adds invoice_pages JSONB column to warehouse_deliveries.
-- Populated by the 'Add delivery from invoice' workflow; NULL for deliveries
-- created without an uploaded document.
-- Stored as an ordered array of {storageId, mimeType, position} objects where
-- storageId references a file in Convex storage.

ALTER TABLE warehouse_deliveries
  ADD COLUMN IF NOT EXISTS invoice_pages JSONB;
