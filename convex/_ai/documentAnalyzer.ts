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
// Adapter contract
// ---------------------------------------------------------------------------

// Any future OCR/AI provider must implement this interface.
// The only method is analyzeInvoice; providers are free to add configuration
// via their constructor without changing the interface.
export interface DocumentAnalyzer {
  analyzeInvoice(
    fileUrl: string,
    mimeType: string,
  ): Promise<AnalyzeInvoiceResult>;
}

// ---------------------------------------------------------------------------
// Result union — callers check status, never catch provider-specific errors.
// ---------------------------------------------------------------------------

export type AnalyzeInvoiceResult =
  | { status: "ok"; data: ParsedInvoice }
  | { status: "not_implemented" }
  | { status: "error"; message: string };

// ---------------------------------------------------------------------------
// Placeholder implementation
// ---------------------------------------------------------------------------

// Returns not_implemented for every call. Replaced in a later phase by a real
// provider without any changes to callers.
class NullDocumentAnalyzer implements DocumentAnalyzer {
  async analyzeInvoice(
    _fileUrl: string,
    _mimeType: string,
  ): Promise<AnalyzeInvoiceResult> {
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
