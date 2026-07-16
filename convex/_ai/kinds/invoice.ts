// Kind "invoice" — prompt + walidacja + mapowanie wyniesione 1:1 z providera
// OpenAI (refaktor). Zachowanie identyczne jak przed refaktorem.
import type { AnalysisKind, ParsedInvoice, ParsedInvoiceItem } from "../documentAnalyzer";

// ---------------------------------------------------------------------------
// Prompt (przeniesiony bez zmian z openaiDocumentAnalyzer.ts)
// ---------------------------------------------------------------------------

const INVOICE_PROMPT = `Extract all invoice data from the provided document(s). Return a single JSON object with this exact structure:

{
  "supplierName": string | null,
  "supplierNip": string | null,
  "invoiceNumber": string | null,
  "invoiceDate": string | null,
  "deliveryDate": string | null,
  "currency": string | null,
  "items": [
    {
      "productName": string,
      "quantity": number,
      "unit": string | null,
      "unitPriceNet": number | null,
      "unitPriceGross": number | null,
      "vatRate": number | null,
      "vatCode": string | null,
      "lineValueNet": number | null,
      "lineValueGross": number | null,
      "lotNumber": string | null,
      "expiryDate": string | null
    }
  ],
  "confidence": number
}

Rules:
- All dates must be ISO 8601 format YYYY-MM-DD.
- Do NOT guess missing values — use null.
- Extract "lotNumber" and "expiryDate" per item ONLY when explicitly printed on the invoice.
- "vatRate" is a percentage value (e.g. 23 for 23%, 8 for 8%, 0 for 0%).
- "confidence" is a 0–1 score reflecting overall extraction certainty.
- If a field is uncertain, set it to null rather than guessing.`;

// ---------------------------------------------------------------------------
// Raw response types and validation (przeniesione bez zmian)
// ---------------------------------------------------------------------------

interface RawItem {
  productName: unknown;
  quantity: unknown;
  unit: unknown;
  unitPriceNet: unknown;
  unitPriceGross: unknown;
  vatRate: unknown;
  vatCode: unknown;
  lineValueNet: unknown;
  lineValueGross: unknown;
  lotNumber: unknown;
  expiryDate: unknown;
}

interface RawInvoice {
  supplierName: unknown;
  invoiceNumber: unknown;
  invoiceDate: unknown;
  items: RawItem[];
  confidence: unknown;
}

function isRawInvoice(v: unknown): v is RawInvoice {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.items)) return false;
  for (const item of o.items as unknown[]) {
    if (!item || typeof item !== "object") return false;
    if (!("productName" in (item as object))) return false;
  }
  return true;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapItem(raw: RawItem): ParsedInvoiceItem {
  return {
    productName: str(raw.productName) ?? "",
    quantity: num(raw.quantity) ?? 0,
    unit: str(raw.unit),
    unitPrice: num(raw.unitPriceNet),
    unitPriceGross: num(raw.unitPriceGross),
    vatRate: num(raw.vatRate),
    vatCode: str(raw.vatCode),
    lineValueNet: num(raw.lineValueNet),
    lineValueGross: num(raw.lineValueGross),
    lotNumber: str(raw.lotNumber),
    expiryDate: str(raw.expiryDate),
  };
}

function mapInvoice(raw: RawInvoice, rawJson: string): ParsedInvoice {
  return {
    supplierName: str(raw.supplierName),
    invoiceNumber: str(raw.invoiceNumber),
    invoiceDate: str(raw.invoiceDate),
    items: raw.items.map(mapItem),
    confidence: num(raw.confidence),
    rawText: rawJson,
  };
}

// ---------------------------------------------------------------------------
// Kind definition
// ---------------------------------------------------------------------------

export const invoiceKind: AnalysisKind<ParsedInvoice> = {
  id: "invoice",
  maxTokens: 4096,
  buildPrompt: () => INVOICE_PROMPT,
  validate: (raw) => isRawInvoice(raw),
  map: (raw, opts) => mapInvoice(raw as RawInvoice, opts.rawJson),
};
