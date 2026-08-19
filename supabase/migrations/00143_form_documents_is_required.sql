-- Migration: 00143_form_documents_is_required.sql
-- Add is_required column to form_documents so the document gate can distinguish
-- required documents (block status transitions) from optional ones (no gate effect).
-- NULL = unknown / pre-migration row, treated as required for backward compatibility.

ALTER TABLE form_documents
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN;
