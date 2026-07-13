// OpenAI implementation of DocumentAnalyzer (#3038).
//
// Sends invoice pages (PDF, JPEG, PNG) to a GPT-4o-class model and returns a
// validated ParsedInvoice. Files are fetched server-side via the StorageFetcher
// callback — no public URLs are exposed to the model.
//
// All OpenAI SDK / type imports stay inside this module. Nothing outside
// convex/_ai/providers/* should import from "openai".

import OpenAI, { APIError } from "openai";
import type {
  DocumentAnalyzer,
  DocumentPage,
  AnalyzeInvoiceResult,
  ParsedInvoice,
  ParsedInvoiceItem,
  StorageFetcher,
} from "../documentAnalyzer";

// Duplicate the supported-types check locally to avoid a circular runtime dep.
const SUPPORTED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const REQUEST_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const USER_PROMPT = `Extract all invoice data from the provided document(s). Return a single JSON object with this exact structure:

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
// Raw response types and validation
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
// Provider
// ---------------------------------------------------------------------------

export class OpenAIDocumentAnalyzer implements DocumentAnalyzer {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly fetchFile: StorageFetcher;

  constructor(apiKey: string, model: string, fetchFile: StorageFetcher) {
    this.client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS });
    this.model = model;
    this.fetchFile = fetchFile;
  }

  async analyzeInvoice(pages: DocumentPage[]): Promise<AnalyzeInvoiceResult> {
    if (pages.length === 0) return { status: "no_pages" };

    const unsupported = pages.find((p) => !SUPPORTED_MIME_TYPES.has(p.mimeType));
    if (unsupported) {
      return { status: "unsupported_format", mimeType: unsupported.mimeType };
    }

    const sorted = [...pages].sort((a, b) => a.position - b.position);

    const contentParts: OpenAI.ChatCompletionContentPart[] = [];

    for (const page of sorted) {
      let blob: Blob | null;
      try {
        blob = await this.fetchFile(page.storageId);
      } catch (err) {
        return {
          status: "error",
          message: `File fetch failed (${page.storageId}): ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      if (!blob) {
        return { status: "error", message: `File not found in storage: ${page.storageId}` };
      }

      const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

      if (page.mimeType === "application/pdf") {
        contentParts.push({
          type: "file",
          file: {
            file_data: `data:application/pdf;base64,${base64}`,
            filename: `invoice_p${page.position}.pdf`,
          },
        });
      } else {
        contentParts.push({
          type: "image_url",
          image_url: {
            url: `data:${page.mimeType};base64,${base64}`,
            detail: "high",
          },
        });
      }
    }

    contentParts.push({ type: "text", text: USER_PROMPT });

    let rawText: string;
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: contentParts }],
        max_tokens: 4096,
      });
      rawText = completion.choices[0]?.message?.content ?? "";
    } catch (err) {
      if (err instanceof APIError) {
        return { status: "error", message: `OpenAI API error ${err.status}: ${err.message}` };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { status: "error", message: `Request failed: ${msg}` };
    }

    if (!rawText) {
      return { status: "error", message: "Empty response from model" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return { status: "error", message: "Model returned non-JSON response" };
    }

    if (!isRawInvoice(parsed)) {
      return { status: "error", message: "Model response does not match expected invoice schema" };
    }

    return { status: "ok", data: mapInvoice(parsed, rawText) };
  }
}
