// Tests for analyzeDeliveryInvoice action (#3045).
//
// Covers: multi-page success, no pages, no provider config, provider error,
// and re-analysis that preserves the previous good result on failure.

import { describe, expect, test, vi, beforeEach } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

// ---------------------------------------------------------------------------
// Mock documentAnalyzer so tests control what the analyzer returns without
// touching real OpenAI or Convex file storage.
// ---------------------------------------------------------------------------

const { mockAnalyzeInvoice } = vi.hoisted(() => ({
  mockAnalyzeInvoice: vi.fn(),
}));

vi.mock("../../convex/_ai/documentAnalyzer", () => ({
  getDocumentTransport: () => ({}),
  analyzeDocument: mockAnalyzeInvoice,
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SAMPLE_PAGES = [
  { storageId: "store-page-1", mimeType: "image/jpeg", position: 1 },
  { storageId: "store-page-2", mimeType: "image/jpeg", position: 2 },
];

const SAMPLE_PARSED_INVOICE = {
  supplierName: "ACME Sp. z o.o.",
  invoiceNumber: "FV/2024/001",
  invoiceDate: "2024-01-15",
  items: [
    {
      productName: "Rękawiczki nitrylowe",
      quantity: 100,
      unit: "szt",
      unitPrice: 0.5,
      unitPriceGross: 0.615,
      vatRate: 23,
      vatCode: "A",
      lineValueNet: 50,
      lineValueGross: 61.5,
      lotNumber: null,
      expiryDate: null,
    },
  ],
  confidence: 0.92,
  rawText: '{"raw": "json from model"}',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedDelivery(
  organizationId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const db = createSupabaseDb();
  const deliveryId = await db.insert("warehouseDeliveries", {
    organizationId,
    supplierName: null,
    invoiceNumber: null,
    deliveryDate: null,
    locationId: null,
    notes: null,
    status: "draft",
    totalValue: null,
    totalValueGross: null,
    invoicePages: SAMPLE_PAGES,
    createdBy: userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });
  return deliveryId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analyzeDeliveryInvoice — multi-page success (#3045)", () => {
  test("stores completed status and ParsedInvoice (without rawText) on success", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const deliveryId = await seedDelivery(String(organizationId), String(userId));

    mockAnalyzeInvoice.mockResolvedValue({
      status: "ok",
      data: SAMPLE_PARSED_INVOICE,
    });

    const result = await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.analyzeDeliveryInvoice, {
        organizationId,
        deliveryId,
      });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;

    // rawText must not be stored
    expect(result.result).not.toHaveProperty("rawText");
    expect(result.result.supplierName).toBe("ACME Sp. z o.o.");
    expect(result.result.invoiceNumber).toBe("FV/2024/001");
    expect(result.result.items).toHaveLength(1);
    expect(result.result.items[0].productName).toBe("Rękawiczki nitrylowe");

    // Verify persisted on the delivery row
    const db = createSupabaseDb();
    const row = (await db.get("warehouseDeliveries", deliveryId)) as Record<
      string,
      unknown
    > | null;
    expect(row?.analysisStatus).toBe("completed");
    expect(row?.analysisResult).toBeDefined();
    expect((row?.analysisResult as Record<string, unknown>)?.rawText).toBeUndefined();
    expect(typeof row?.analysisCompletedAt).toBe("number");
    expect(row?.analysisError).toBeNull();

    // Analyzer was called once with pages sorted by position
    expect(mockAnalyzeInvoice).toHaveBeenCalledTimes(1);
    // analyzeDocument(transport, kind, pages) — pages is arg index 2
    const passedPages = mockAnalyzeInvoice.mock.calls[0][2] as Array<{
      position: number;
    }>;
    expect(passedPages.map((p) => p.position)).toEqual([1, 2]);
  });
});

describe("analyzeDeliveryInvoice — no pages (#3045)", () => {
  test("throws when delivery has no invoice pages", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const deliveryId = await seedDelivery(String(organizationId), String(userId), {
      invoicePages: [],
    });

    await expect(
      t
        .withIdentity(identity)
        .action(api.warehouseDeliveries.analyzeDeliveryInvoice, {
          organizationId,
          deliveryId,
        }),
    ).rejects.toThrow("no invoice pages");

    // Analyzer must not be called
    expect(mockAnalyzeInvoice).not.toHaveBeenCalled();
  });
});

describe("analyzeDeliveryInvoice — no provider config (#3045)", () => {
  test("returns failed status with descriptive message when provider is not configured", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const deliveryId = await seedDelivery(String(organizationId), String(userId));

    // NullDocumentAnalyzer returns not_implemented when no API key is set
    mockAnalyzeInvoice.mockResolvedValue({ status: "not_implemented" });

    const result = await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.analyzeDeliveryInvoice, {
        organizationId,
        deliveryId,
      });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.error).toMatch(/not configured/i);

    const db = createSupabaseDb();
    const row = (await db.get("warehouseDeliveries", deliveryId)) as Record<
      string,
      unknown
    > | null;
    expect(row?.analysisStatus).toBe("failed");
    expect(typeof row?.analysisError).toBe("string");
  });
});

describe("analyzeDeliveryInvoice — provider error (#3045)", () => {
  test("returns failed status and stores error message on provider error", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const deliveryId = await seedDelivery(String(organizationId), String(userId));

    mockAnalyzeInvoice.mockResolvedValue({
      status: "error",
      message: "OpenAI rate limit exceeded",
    });

    const result = await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.analyzeDeliveryInvoice, {
        organizationId,
        deliveryId,
      });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.error).toContain("rate limit");

    const db = createSupabaseDb();
    const row = (await db.get("warehouseDeliveries", deliveryId)) as Record<
      string,
      unknown
    > | null;
    expect(row?.analysisStatus).toBe("failed");
    expect(String(row?.analysisError)).toContain("rate limit");
  });
});

describe("analyzeDeliveryInvoice — re-analysis preserves previous result (#3045)", () => {
  test("keeps previous successful result when re-analysis fails", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const deliveryId = await seedDelivery(String(organizationId), String(userId));

    // First run: success
    mockAnalyzeInvoice.mockResolvedValueOnce({
      status: "ok",
      data: SAMPLE_PARSED_INVOICE,
    });

    const firstResult = await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.analyzeDeliveryInvoice, {
        organizationId,
        deliveryId,
      });
    expect(firstResult.status).toBe("completed");

    // Second run: provider error
    mockAnalyzeInvoice.mockResolvedValueOnce({
      status: "error",
      message: "Temporary service unavailable",
    });

    const secondResult = await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.analyzeDeliveryInvoice, {
        organizationId,
        deliveryId,
      });
    expect(secondResult.status).toBe("failed");

    // The previous successful analysisResult must still be present on the row
    const db = createSupabaseDb();
    const row = (await db.get("warehouseDeliveries", deliveryId)) as Record<
      string,
      unknown
    > | null;
    expect(row?.analysisStatus).toBe("failed");
    // Previous good result preserved
    expect(row?.analysisResult).not.toBeNull();
    expect(
      (row?.analysisResult as Record<string, unknown>)?.supplierName,
    ).toBe("ACME Sp. z o.o.");
    // Error message from the failed run is stored
    expect(String(row?.analysisError)).toContain("unavailable");
  });
});
