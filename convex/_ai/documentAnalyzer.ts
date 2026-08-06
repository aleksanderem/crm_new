// AI/OCR integration adapter layer (#3026, #3038).
//
// Defines the transport contract any OCR/AI provider must satisfy and exports
// factories/helpers that callers use to run document analysis.
// The warehouse module depends ONLY on the types and factories here — it never
// imports a concrete provider directly.
//
// Current implementation: OpenAIDocumentAnalyzer when OPENAI_API_KEY is set,
// NullDocumentTransport otherwise.


// ---------------------------------------------------------------------------
// Input — ordered pages that together form one document (#3035).
// ---------------------------------------------------------------------------

// A single page of a document. Pages are ordered by `position` (1-based).
// One document may be a single PDF or one/several images.
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
// Storage fetcher — passed by the calling action so the provider can read
// file bytes server-side without touching public URLs.
// ---------------------------------------------------------------------------

export type StorageFetcher = (storageId: string) => Promise<Blob | null>;

// ---------------------------------------------------------------------------
// Transport result — raw JSON string on success, or a typed failure.
//
// Statuses:
//   ok                — transport succeeded; rawJson holds the model's output
//   not_implemented   — no provider configured (placeholder)
//   no_pages          — pages array was empty; nothing to analyze
//   unsupported_format — one or more pages have a mimeType the provider
//                        cannot process (not pdf/jpeg/png)
//   error             — provider returned an unexpected failure
// ---------------------------------------------------------------------------

export type TransportResult =
  | { status: "ok"; rawJson: string }
  | { status: "not_implemented" }
  | { status: "no_pages" }
  | { status: "unsupported_format"; mimeType: string }
  | { status: "error"; message: string };

// ---------------------------------------------------------------------------
// Transport contract — any provider must implement this interface.
// ---------------------------------------------------------------------------

export interface DocumentTransport {
  run(pages: DocumentPage[], prompt: string, maxTokens?: number): Promise<TransportResult>;
}

// ---------------------------------------------------------------------------
// Analysis kind — encapsulates prompt, validation, and result mapping for
// a specific document type (e.g. invoice, form_template).
// ---------------------------------------------------------------------------

export interface AnalysisKind<TResult> {
  id: string;
  buildPrompt(context?: Record<string, unknown>): string;
  validate(raw: unknown): boolean;
  map(raw: unknown, opts: { rawJson: string; context?: Record<string, unknown> }): TResult;
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// Analyze result — callers check status, never catch provider-specific errors.
// ---------------------------------------------------------------------------

export type AnalyzeResult<T> =
  | { status: "ok"; data: T }
  | Exclude<TransportResult, { status: "ok" }>;

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
// Placeholder transport implementation
// ---------------------------------------------------------------------------

class NullDocumentTransport implements DocumentTransport {
  async run(pages: DocumentPage[]): Promise<TransportResult> {
    if (pages.length === 0) return { status: "no_pages" };
    const unsupported = pages.find((p) => !isSupportedMimeType(p.mimeType));
    if (unsupported) return { status: "unsupported_format", mimeType: unsupported.mimeType };
    return { status: "not_implemented" };
  }
}

// ---------------------------------------------------------------------------
// Factory — the single entry point for all callers.
// ---------------------------------------------------------------------------

// Returns OpenAIDocumentAnalyzer when OPENAI_API_KEY is configured, otherwise
// NullDocumentTransport. The model can be overridden via OPENAI_INVOICE_MODEL.
// `fetchFile` is provided by the calling action (ctx.storage.get) so the
// provider can fetch bytes server-side without exposing public URLs.
//
// Dynamic import ensures the `openai` npm package is only resolved at runtime
// when the API key is actually set — keeping the module loadable in test
// environments where the package is not installed.
export async function getDocumentTransport(fetchFile: StorageFetcher): Promise<DocumentTransport> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    const model = process.env.OPENAI_INVOICE_MODEL ?? "gpt-4o";
    const { OpenAIDocumentAnalyzer } = await import("./providers/openaiDocumentAnalyzer");
    return new OpenAIDocumentAnalyzer(apiKey, model, fetchFile);
  }
  return new NullDocumentTransport();
}

// ---------------------------------------------------------------------------
// analyzeDocument — generic analysis runner.
// ---------------------------------------------------------------------------

export async function analyzeDocument<T>(
  transport: DocumentTransport,
  kind: AnalysisKind<T>,
  pages: DocumentPage[],
  context?: Record<string, unknown>,
): Promise<AnalyzeResult<T>> {
  const res = await transport.run(pages, kind.buildPrompt(context), kind.maxTokens);
  if (res.status !== "ok") return res;
  let raw: unknown;
  try {
    raw = JSON.parse(res.rawJson);
  } catch {
    return { status: "error", message: "Model returned non-JSON response" };
  }
  if (!kind.validate(raw)) {
    return { status: "error", message: `Model response does not match expected ${kind.id} schema` };
  }
  return { status: "ok", data: kind.map(raw, { rawJson: res.rawJson, context }) };
}
