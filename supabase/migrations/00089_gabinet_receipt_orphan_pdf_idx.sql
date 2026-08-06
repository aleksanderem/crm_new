-- Partial index to accelerate the orphaned-receipt back-fill query (issue #3797).
--
-- A receipt row is "orphaned" when blob storage fails after the atomic
-- insert_gabinet_receipt_with_number transaction commits: the row exists with
-- pdf_url = NULL and pdf_storage_id = NULL. The hourly back-fill cron job
-- (convex/crons.ts → _backfillOrphanedPdfReceipts) scans for these rows.
--
-- Without this index the scan is a sequential table scan filtered in Postgres;
-- with it, only the (typically empty) orphan set is touched.

CREATE INDEX IF NOT EXISTS gabinet_receipts_orphan_pdf_idx
  ON gabinet_receipts (status)
  WHERE pdf_url IS NULL AND pdf_storage_id IS NULL;
