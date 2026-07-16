// OpenAI implementation of DocumentTransport (#3038).
//
// Sends document pages (PDF, JPEG, PNG) to a GPT-4o-class model and returns
// the raw JSON string from the model. Files are fetched server-side via the
// StorageFetcher callback — no public URLs are exposed to the model.
//
// All OpenAI SDK / type imports stay inside this module. Nothing outside
// convex/_ai/providers/* should import from "openai".

import OpenAI, { APIError } from "openai";
import type {
  DocumentTransport,
  DocumentPage,
  TransportResult,
  StorageFetcher,
} from "../documentAnalyzer";

// Duplicate the supported-types check locally to avoid a circular runtime dep.
const SUPPORTED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const REQUEST_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class OpenAIDocumentAnalyzer implements DocumentTransport {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly fetchFile: StorageFetcher;

  constructor(apiKey: string, model: string, fetchFile: StorageFetcher) {
    this.client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS });
    this.model = model;
    this.fetchFile = fetchFile;
  }

  async run(pages: DocumentPage[], prompt: string, maxTokens = 4096): Promise<TransportResult> {
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

    contentParts.push({ type: "text", text: prompt });

    let rawText: string;
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: contentParts }],
        max_tokens: maxTokens,
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

    return { status: "ok", rawJson: rawText };
  }
}
