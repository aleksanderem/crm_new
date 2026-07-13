// AI/OCR integration adapter layer (#3026).
//
// Defines the contract any future OCR/AI provider must satisfy and exports a
// factory (`getDocumentAnalyzer`) that callers use to obtain the active
// implementation. The warehouse module depends ONLY on the types and factory
// here — it never imports a concrete provider directly.
//
// Current implementation: NullDocumentAnalyzer (not_implemented placeholder).
// To wire up a real provider in a later phase: implement DocumentAnalyzer and
// return it from getDocumentAnalyzer. No changes elsewhere are required.

// ---------------------------------------------------------------------------
// Input — ordered pages that together form one invoice document (#3035).
// ---------------------------------------------------------------------------

// A single page of an invoice document. Pages are ordered by `position`
// (1-based). One invoice may be a single PDF or one/several images.
//
// `storageId` is a Convex storage ID — callers never pass public URLs.
// Providers fetch file bytes server-side via `ctx.storage.get(storageId)`.
//
// Supported mimeTypes: "application/pdf", "image/jpeg", "image/png".
export interface DocumentPage {
  storageId: string;
  mimeType: string;
  position: number;
}

// ---------------------------------------------------------------------------
// Result shape — the normalized invoice the warehouse layer consumes.
// ---------------------------------------------------------------------------

export interface ParsedInvoiceItem {
  productName: string;
  quantity: number;
  unit: string | null;
  unitPrice: number | null;
  vatRate: number | null;
  vatCode: string | null;
  unitPriceGross: number | null;
  lineValueNet: number | null;
  lineValueGross: number | null;
  lotNumber: string | null;
  expiryDate: string | null; // ISO date YYYY-MM-DD or null
}

export interface ParsedInvoice {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // ISO date YYYY-MM-DD or null
  items: ParsedInvoiceItem[];
  // 0–1 confidence score if the provider exposes it, otherwise null
  confidence: number | null;
  // Full extracted text if the provider exposes it (useful for debugging)
  rawText: string | null;
}

// ---------------------------------------------------------------------------
// Result union — callers check status, never catch provider-specific errors.
//
// Statuses:
//   ok                — analysis succeeded; data holds ParsedInvoice
//   not_implemented   — no provider configured (placeholder)
//   no_pages          — pages array was empty; nothing to analyze
//   unsupported_format — one or more pages have a mimeType the provider
//                        cannot process (not pdf/jpeg/png)
//   error             — provider returned an unexpected failure
// ---------------------------------------------------------------------------

export type AnalyzeInvoiceResult =
  | { status: "ok"; data: ParsedInvoice }
  | { status: "not_implemented" }
  | { status: "no_pages" }
  | { status: "unsupported_format"; mimeType: string }
  | { status: "error"; message: string };

// ---------------------------------------------------------------------------
// Adapter contract
// ---------------------------------------------------------------------------

// Any future OCR/AI provider must implement this interface.
// analyzeInvoice receives all pages of one invoice and returns one result.
// Pages MUST be sorted by position before being passed in; the provider may
// rely on that order when it reassembles the document.
export interface DocumentAnalyzer {
  analyzeInvoice(pages: DocumentPage[]): Promise<AnalyzeInvoiceResult>;
}

// ---------------------------------------------------------------------------
// Supported MIME types (shared validation used by callers and providers)
// ---------------------------------------------------------------------------

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export function isSupportedMimeType(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.has(mimeType);
}

// ---------------------------------------------------------------------------
// Placeholder implementation
// ---------------------------------------------------------------------------

// Returns not_implemented for every call. Replaced in a later phase by a real
// provider without any changes to callers.
class NullDocumentAnalyzer implements DocumentAnalyzer {
  async analyzeInvoice(pages: DocumentPage[]): Promise<AnalyzeInvoiceResult> {
    if (pages.length === 0) {
      return { status: "no_pages" };
    }

    const unsupported = pages.find((p) => !isSupportedMimeType(p.mimeType));
    if (unsupported) {
      return { status: "unsupported_format", mimeType: unsupported.mimeType };
    }

    return { status: "not_implemented" };
  }
}

// ---------------------------------------------------------------------------
// Factory — the single entry point for all callers.
// ---------------------------------------------------------------------------

// Returns the currently configured DocumentAnalyzer. Swap the return value here
// when plugging in a real OCR/AI provider — no other file needs to change.
export function getDocumentAnalyzer(): DocumentAnalyzer {
  return new NullDocumentAnalyzer();
}
