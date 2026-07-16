import { describe, expect, test, vi, beforeEach } from "vitest";
import { OpenAIDocumentAnalyzer } from "../../convex/_ai/providers/openaiDocumentAnalyzer";
import { getDocumentTransport, analyzeDocument } from "../../convex/_ai/documentAnalyzer";
import type { DocumentPage, DocumentTransport } from "../../convex/_ai/documentAnalyzer";
import { invoiceKind } from "../../convex/_ai/kinds/invoice";

// ---------------------------------------------------------------------------
// Hoist mock helpers so they can be referenced inside vi.mock()
// ---------------------------------------------------------------------------

const { mockCreate, MockAPIError } = vi.hoisted(() => {
  class MockAPIError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.name = "APIError";
      this.status = status;
    }
  }
  return { mockCreate: vi.fn(), MockAPIError };
});

vi.mock("openai", () => {
  function MockOpenAI() {
    return { chat: { completions: { create: mockCreate } } };
  }
  MockOpenAI.APIError = MockAPIError;
  return { default: MockOpenAI, APIError: MockAPIError };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOOP_FETCHER = async (_id: string): Promise<Blob | null> => null;

function makeBlob(content = "bytes"): Blob {
  return new Blob([content], { type: "application/octet-stream" });
}

function fakeFetcher(blob: Blob) {
  return async (_id: string): Promise<Blob | null> => blob;
}

function makePages(mimeTypes: string[]): DocumentPage[] {
  return mimeTypes.map((mimeType, i) => ({
    storageId: `store-${i}`,
    mimeType,
    position: i + 1,
  }));
}

const MINIMAL_VALID_RESPONSE = JSON.stringify({
  supplierName: "ACME Sp. z o.o.",
  supplierNip: "1234567890",
  invoiceNumber: "FV/2024/001",
  invoiceDate: "2024-01-15",
  deliveryDate: "2024-01-14",
  currency: "PLN",
  items: [
    {
      productName: "Środek dezynfekujący 5L",
      quantity: 10,
      unit: "szt",
      unitPriceNet: 25.0,
      unitPriceGross: 30.75,
      vatRate: 23,
      vatCode: "A",
      lineValueNet: 250.0,
      lineValueGross: 307.5,
      lotNumber: "LOT-2024-A",
      expiryDate: "2026-01-01",
    },
  ],
  confidence: 0.95,
});

// Helper: runs invoice analysis through the full analyzeDocument pipeline
const analyzeInvoice = (t: { run: DocumentTransport["run"] }, pages: DocumentPage[]) =>
  analyzeDocument(t as DocumentTransport, invoiceKind, pages);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Factory — no configuration
// ---------------------------------------------------------------------------

describe("getDocumentTransport — no configuration", () => {
  test("returns not_implemented when OPENAI_API_KEY is absent", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const transport = getDocumentTransport(NOOP_FETCHER);
    const page: DocumentPage = { storageId: "x", mimeType: "image/jpeg", position: 1 };
    const result = await analyzeInvoice(transport, [page]);
    expect(result.status).toBe("not_implemented");
    vi.unstubAllEnvs();
  });

  test("NullDocumentTransport returns no_pages for empty pages", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const transport = getDocumentTransport(NOOP_FETCHER);
    const result = await analyzeInvoice(transport, []);
    expect(result.status).toBe("no_pages");
    vi.unstubAllEnvs();
  });

  test("NullDocumentTransport returns unsupported_format for unknown MIME", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const transport = getDocumentTransport(NOOP_FETCHER);
    const result = await analyzeInvoice(transport, [
      { storageId: "x", mimeType: "image/gif", position: 1 },
    ]);
    expect(result.status).toBe("unsupported_format");
    if (result.status === "unsupported_format") {
      expect(result.mimeType).toBe("image/gif");
    }
    vi.unstubAllEnvs();
  });
});

// ---------------------------------------------------------------------------
// OpenAIDocumentAnalyzer — edge cases before calling the model
// ---------------------------------------------------------------------------

describe("OpenAIDocumentAnalyzer — pre-call validation", () => {
  test("returns no_pages when pages array is empty", async () => {
    const analyzer = new OpenAIDocumentAnalyzer("sk-test", "gpt-4o", NOOP_FETCHER);
    const result = await analyzeInvoice(analyzer, []);
    expect(result.status).toBe("no_pages");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("returns unsupported_format for unknown MIME type", async () => {
    const analyzer = new OpenAIDocumentAnalyzer("sk-test", "gpt-4o", NOOP_FETCHER);
    const result = await analyzeInvoice(analyzer, [
      { storageId: "x", mimeType: "image/tiff", position: 1 },
    ]);
    expect(result.status).toBe("unsupported_format");
    if (result.status === "unsupported_format") {
      expect(result.mimeType).toBe("image/tiff");
    }
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("returns error when file is not found in storage", async () => {
    const analyzer = new OpenAIDocumentAnalyzer("sk-test", "gpt-4o", NOOP_FETCHER);
    const result = await analyzeInvoice(analyzer, makePages(["image/jpeg"]));
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/not found/i);
    }
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("returns error when file fetch throws", async () => {
    const throwingFetcher = async (_: string): Promise<Blob | null> => {
      throw new Error("Storage unavailable");
    };
    const analyzer = new OpenAIDocumentAnalyzer("sk-test", "gpt-4o", throwingFetcher);
    const result = await analyzeInvoice(analyzer, makePages(["image/jpeg"]));
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("Storage unavailable");
    }
  });
});

// ---------------------------------------------------------------------------
// OpenAIDocumentAnalyzer — valid response mapping
// ---------------------------------------------------------------------------

describe("OpenAIDocumentAnalyzer — correct mapping from model response", () => {
  test("maps a complete invoice response to ParsedInvoice", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: MINIMAL_VALID_RESPONSE } }],
    });

    const analyzer = new OpenAIDocumentAnalyzer(
      "sk-test",
      "gpt-4o",
      fakeFetcher(makeBlob()),
    );
    const result = await analyzeInvoice(analyzer, makePages(["image/jpeg"]));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.data.supplierName).toBe("ACME Sp. z o.o.");
    expect(result.data.invoiceNumber).toBe("FV/2024/001");
    expect(result.data.invoiceDate).toBe("2024-01-15");
    expect(result.data.confidence).toBe(0.95);
    expect(result.data.rawText).toBe(MINIMAL_VALID_RESPONSE);

    const item = result.data.items[0];
    expect(item.productName).toBe("Środek dezynfekujący 5L");
    expect(item.quantity).toBe(10);
    expect(item.unit).toBe("szt");
    expect(item.unitPrice).toBe(25.0); // unitPriceNet maps to unitPrice
    expect(item.unitPriceGross).toBe(30.75);
    expect(item.vatRate).toBe(23);
    expect(item.vatCode).toBe("A");
    expect(item.lineValueNet).toBe(250.0);
    expect(item.lineValueGross).toBe(307.5);
    expect(item.lotNumber).toBe("LOT-2024-A");
    expect(item.expiryDate).toBe("2026-01-01");
  });

  test("maps null fields correctly when data is absent on invoice", async () => {
    const sparse = JSON.stringify({
      supplierName: null,
      invoiceNumber: "FV/001",
      invoiceDate: "2024-03-01",
      deliveryDate: null,
      currency: null,
      items: [
        {
          productName: "Rękawiczki nitrylowe",
          quantity: 100,
          unit: null,
          unitPriceNet: null,
          unitPriceGross: null,
          vatRate: null,
          vatCode: null,
          lineValueNet: null,
          lineValueGross: null,
          lotNumber: null,
          expiryDate: null,
        },
      ],
      confidence: 0.7,
    });

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: sparse } }],
    });

    const analyzer = new OpenAIDocumentAnalyzer(
      "sk-test",
      "gpt-4o",
      fakeFetcher(makeBlob()),
    );
    const result = await analyzeInvoice(analyzer, makePages(["image/png"]));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.data.supplierName).toBeNull();
    const item = result.data.items[0];
    expect(item.lotNumber).toBeNull();
    expect(item.expiryDate).toBeNull();
    expect(item.unit).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// OpenAIDocumentAnalyzer — multi-page invoice
// ---------------------------------------------------------------------------

describe("OpenAIDocumentAnalyzer — multi-page invoice", () => {
  test("sends all pages to the model and returns merged result", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: MINIMAL_VALID_RESPONSE } }],
    });

    const fetcher = fakeFetcher(makeBlob());
    const analyzer = new OpenAIDocumentAnalyzer("sk-test", "gpt-4o", fetcher);

    const pages: DocumentPage[] = [
      { storageId: "page-2", mimeType: "image/jpeg", position: 2 },
      { storageId: "page-1", mimeType: "image/jpeg", position: 1 },
      { storageId: "page-3", mimeType: "image/png", position: 3 },
    ];

    const result = await analyzeInvoice(analyzer, pages);
    expect(result.status).toBe("ok");

    // Model must have been called exactly once with all three pages as content
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0];
    const content = call.messages[0].content as Array<{ type: string }>;
    // 3 image parts + 1 text prompt
    expect(content.filter((p) => p.type === "image_url")).toHaveLength(3);
  });

  test("pages are passed to model sorted by position", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: MINIMAL_VALID_RESPONSE } }],
    });

    const fetchOrder: string[] = [];
    const trackingFetcher = async (id: string): Promise<Blob | null> => {
      fetchOrder.push(id);
      return makeBlob();
    };

    const analyzer = new OpenAIDocumentAnalyzer("sk-test", "gpt-4o", trackingFetcher);
    await analyzeInvoice(analyzer, [
      { storageId: "c", mimeType: "image/jpeg", position: 3 },
      { storageId: "a", mimeType: "image/jpeg", position: 1 },
      { storageId: "b", mimeType: "image/jpeg", position: 2 },
    ]);

    expect(fetchOrder).toEqual(["a", "b", "c"]);
  });

  test("mixed PDF and image pages are sent correctly", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: MINIMAL_VALID_RESPONSE } }],
    });

    const analyzer = new OpenAIDocumentAnalyzer(
      "sk-test",
      "gpt-4o",
      fakeFetcher(makeBlob()),
    );
    const result = await analyzeInvoice(analyzer, [
      { storageId: "pdf", mimeType: "application/pdf", position: 1 },
      { storageId: "img", mimeType: "image/jpeg", position: 2 },
    ]);

    expect(result.status).toBe("ok");
    const content = mockCreate.mock.calls[0][0].messages[0]
      .content as Array<{ type: string }>;
    const types = content.filter((p) => p.type !== "text").map((p) => p.type);
    expect(types).toContain("file");    // PDF → file type
    expect(types).toContain("image_url"); // JPEG → image_url
  });
});

// ---------------------------------------------------------------------------
// OpenAIDocumentAnalyzer — model error handling
// ---------------------------------------------------------------------------

describe("OpenAIDocumentAnalyzer — error handling", () => {
  test("returns error when model returns invalid JSON", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "This is not JSON" } }],
    });

    const analyzer = new OpenAIDocumentAnalyzer(
      "sk-test",
      "gpt-4o",
      fakeFetcher(makeBlob()),
    );
    const result = await analyzeInvoice(analyzer, makePages(["image/jpeg"]));

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/non-json/i);
    }
  });

  test("returns error when model response does not match expected schema", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ unexpected: "structure" }) } }],
    });

    const analyzer = new OpenAIDocumentAnalyzer(
      "sk-test",
      "gpt-4o",
      fakeFetcher(makeBlob()),
    );
    const result = await analyzeInvoice(analyzer, makePages(["image/jpeg"]));

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/schema/i);
    }
  });

  test("returns error when model returns empty content", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "" } }],
    });

    const analyzer = new OpenAIDocumentAnalyzer(
      "sk-test",
      "gpt-4o",
      fakeFetcher(makeBlob()),
    );
    const result = await analyzeInvoice(analyzer, makePages(["image/jpeg"]));

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/empty/i);
    }
  });

  test("returns error on OpenAI API error", async () => {
    mockCreate.mockRejectedValue(new MockAPIError("Rate limit exceeded", 429));

    const analyzer = new OpenAIDocumentAnalyzer(
      "sk-test",
      "gpt-4o",
      fakeFetcher(makeBlob()),
    );
    const result = await analyzeInvoice(analyzer, makePages(["image/jpeg"]));

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("429");
    }
  });

  test("returns error on network / timeout failure", async () => {
    mockCreate.mockRejectedValue(new Error("timeout: request took too long"));

    const analyzer = new OpenAIDocumentAnalyzer(
      "sk-test",
      "gpt-4o",
      fakeFetcher(makeBlob()),
    );
    const result = await analyzeInvoice(analyzer, makePages(["image/jpeg"]));

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("timeout");
    }
  });
});
