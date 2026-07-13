// Tests for invoice item → product matching (#3050).
//
// Part A — pure unit tests of matchInvoiceItems / normalizeName /
//           isNonInventoryCandidate (no I/O, no auth).
// Part B — action-level test for matchDeliveryItems: verifies proposals are
//           persisted and that re-running replaces only matchingProposals (not
//           analysisResult).

import { describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";
import {
  matchInvoiceItems,
  normalizeName,
  isNonInventoryCandidate,
} from "../../convex/_ai/invoiceMatching";
import type { ParsedInvoiceItem } from "../../convex/_ai/documentAnalyzer";
import type { MatchingProposals } from "../../convex/_ai/invoiceMatching";

// matchDeliveryItems does not use the document analyzer, but warehouseDeliveries.ts
// statically imports getDocumentAnalyzer which chains to openai (not installed in tests).
// Mock it to avoid the missing-package error, matching the pattern in
// deliveryInvoiceAnalysis.test.ts and deliveryItemDecisions.test.ts.
vi.mock("../../convex/_ai/documentAnalyzer", () => ({
  getDocumentAnalyzer: () => ({ analyzeInvoice: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(productName: string): ParsedInvoiceItem {
  return {
    productName,
    quantity: 1,
    unit: "szt",
    unitPrice: null,
    vatRate: null,
    vatCode: null,
    unitPriceGross: null,
    lineValueNet: null,
    lineValueGross: null,
    lotNumber: null,
    expiryDate: null,
  };
}

const SAMPLE_ANALYSIS_RESULT = {
  supplierName: "ACME Sp. z o.o.",
  invoiceNumber: "FV/2024/001",
  invoiceDate: "2024-01-15",
  items: [
    makeItem("Rękawiczki nitrylowe"),
  ],
  confidence: 0.92,
};

async function seedDeliveryWithAnalysis(
  organizationId: string,
  userId: string,
  items: ParsedInvoiceItem[] = [makeItem("Rękawiczki nitrylowe")],
): Promise<string> {
  const db = createSupabaseDb();
  return db.insert("warehouseDeliveries", {
    organizationId,
    supplierName: "ACME Sp. z o.o.",
    invoiceNumber: "FV/2024/001",
    deliveryDate: null,
    locationId: null,
    notes: null,
    status: "draft",
    totalValue: null,
    totalValueGross: null,
    invoicePages: [{ storageId: "store-p1", mimeType: "image/jpeg", position: 1 }],
    analysisStatus: "completed",
    analysisResult: { ...SAMPLE_ANALYSIS_RESULT, items },
    analysisCompletedAt: Date.now(),
    analysisError: null,
    createdBy: userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function seedProduct(
  organizationId: string,
  userId: string,
  name: string,
): Promise<string> {
  const db = createSupabaseDb();
  return db.insert("products", {
    organizationId,
    name,
    sku: `SKU-${Math.random().toString(36).slice(2)}`,
    unitPrice: 10,
    isActive: true,
    createdBy: userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Part A — pure function tests
// ---------------------------------------------------------------------------

describe("normalizeName", () => {
  test("lowercases and trims", () => {
    expect(normalizeName("  Stylage XL  ")).toBe("stylage xl");
  });

  test("collapses whitespace", () => {
    expect(normalizeName("Stylage  XL   1  ml")).toBe("stylage xl 1 ml");
  });

  test("removes simple punctuation and collapses resulting spaces", () => {
    expect(normalizeName("Stylage, XL.")).toBe("stylage xl");
  });

  test("preserves hyphens (variant separators)", () => {
    expect(normalizeName("Juvederm Ultra-2")).toBe("juvederm ultra-2");
  });
});

describe("isNonInventoryCandidate", () => {
  test.each([
    ["Transport", true],
    ["Dostawa kurierska", true],
    ["Rabat 10%", true],
    ["Usługa pakowania", true],
    ["Opłata manipulacyjna", true],
    ["Rękawiczki nitrylowe", false],
    ["Stylage XL 1 ml", false],
  ])("%s → %s", (name, expected) => {
    expect(isNonInventoryCandidate(name)).toBe(expected);
  });
});

describe("matchInvoiceItems — exact match", () => {
  test("returns status=matched when one product has an identical normalized name", () => {
    const result = matchInvoiceItems(
      [makeItem("Rękawiczki nitrylowe")],
      [{ productId: "p1", productName: "Rękawiczki nitrylowe" }],
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe("matched");
    expect(result.items[0].matched?.productId).toBe("p1");
    expect(result.items[0].matched?.matchReason).toBe("exact_name");
    expect(result.items[0].invoiceName).toBe("Rękawiczki nitrylowe");
  });

  test("exact match is case- and whitespace-insensitive", () => {
    const result = matchInvoiceItems(
      [makeItem("rękawiczki  nitrylowe")],
      [{ productId: "p1", productName: "Rękawiczki nitrylowe" }],
    );
    expect(result.items[0].status).toBe("matched");
  });
});

describe("matchInvoiceItems — variant/capacity difference → suggestions not matched", () => {
  test("Stylage XL 1 ml vs Stylage M 1 ml produces suggestions", () => {
    const result = matchInvoiceItems(
      [makeItem("Stylage XL 1 ml")],
      [
        { productId: "p1", productName: "Stylage M 1 ml" },
        { productId: "p2", productName: "Stylage L 1 ml" },
      ],
    );
    expect(result.items[0].status).toBe("suggestions");
    expect(result.items[0].matched).toBeUndefined();
    // Both similar products should appear as candidates
    expect(result.items[0].suggestions).toBeDefined();
    expect(result.items[0].suggestions!.length).toBeGreaterThan(0);
  });

  test("Stylage XL 1 ml does not auto-match Stylage M 1 ml as 'matched'", () => {
    const result = matchInvoiceItems(
      [makeItem("Stylage XL 1 ml")],
      [{ productId: "p1", productName: "Stylage M 1 ml" }],
    );
    expect(result.items[0].status).not.toBe("matched");
  });
});

describe("matchInvoiceItems — multiple similar products → suggestions", () => {
  test("returns status=suggestions with all candidates when multiple products share high similarity", () => {
    const result = matchInvoiceItems(
      [makeItem("Juvederm Ultra 2 ml")],
      [
        { productId: "p1", productName: "Juvederm Ultra 1 ml" },
        { productId: "p2", productName: "Juvederm Ultra 2 ml" },
        { productId: "p3", productName: "Juvederm Ultra 4 ml" },
      ],
    );
    // "Juvederm Ultra 2 ml" exactly matches p2
    expect(result.items[0].status).toBe("matched");
    expect(result.items[0].matched?.productId).toBe("p2");
  });

  test("returns suggestions when invoice name partially matches multiple products", () => {
    const result = matchInvoiceItems(
      [makeItem("Juvederm Ultra")],
      [
        { productId: "p1", productName: "Juvederm Ultra 1 ml" },
        { productId: "p2", productName: "Juvederm Ultra 2 ml" },
      ],
    );
    expect(result.items[0].status).toBe("suggestions");
    expect(result.items[0].suggestions!.length).toBeGreaterThanOrEqual(1);
  });
});

describe("matchInvoiceItems — no match", () => {
  test("returns status=unmatched when no product is similar", () => {
    const result = matchInvoiceItems(
      [makeItem("Całkowicie nieznany preparat XYZ")],
      [{ productId: "p1", productName: "Rękawiczki nitrylowe" }],
    );
    expect(result.items[0].status).toBe("unmatched");
    expect(result.items[0].matched).toBeUndefined();
    expect(result.items[0].suggestions).toBeUndefined();
  });

  test("returns unmatched when product list is empty", () => {
    const result = matchInvoiceItems([makeItem("Stylage XL 1 ml")], []);
    expect(result.items[0].status).toBe("unmatched");
  });
});

describe("matchInvoiceItems — non-inventory candidate", () => {
  test("returns status=non_inventory_candidate for transport line with no product match", () => {
    const result = matchInvoiceItems([makeItem("Transport")], []);
    expect(result.items[0].status).toBe("non_inventory_candidate");
    expect(result.items[0].handlingHint).toBeDefined();
  });

  test("dostawa is detected as non_inventory_candidate", () => {
    const result = matchInvoiceItems([makeItem("Dostawa ekspresowa")], []);
    expect(result.items[0].status).toBe("non_inventory_candidate");
  });

  test("rabat is detected as non_inventory_candidate", () => {
    const result = matchInvoiceItems([makeItem("Rabat 5%")], []);
    expect(result.items[0].status).toBe("non_inventory_candidate");
  });

  test("product named 'Transport' that exists in catalog still matches", () => {
    // If the org has a product literally called "Transport", exact match wins
    const result = matchInvoiceItems(
      [makeItem("Transport")],
      [{ productId: "p1", productName: "Transport" }],
    );
    expect(result.items[0].status).toBe("matched");
  });
});

// ---------------------------------------------------------------------------
// Part B — action-level tests
// ---------------------------------------------------------------------------

describe("matchDeliveryItems action — re-run does not change analysisResult", () => {
  test("proposals are persisted; re-run overwrites only matchingProposals", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const productId = await seedProduct(
      String(organizationId),
      String(userId),
      "Rękawiczki nitrylowe",
    );

    const deliveryId = await seedDeliveryWithAnalysis(
      String(organizationId),
      String(userId),
      [makeItem("Rękawiczki nitrylowe")],
    );

    // First run
    const proposals = (await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.matchDeliveryItems, {
        organizationId,
        deliveryId,
      })) as MatchingProposals;

    expect(proposals.items).toHaveLength(1);
    expect(proposals.items[0].status).toBe("matched");
    expect(proposals.items[0].matched?.productId).toBe(productId);

    const db = createSupabaseDb();
    const row1 = (await db.get("warehouseDeliveries", deliveryId)) as Record<
      string,
      unknown
    > | null;
    // analysisResult must be untouched
    expect(
      (row1?.analysisResult as Record<string, unknown>)?.invoiceNumber,
    ).toBe("FV/2024/001");
    expect(row1?.matchingProposals).toBeDefined();

    // Second run (re-matching)
    await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.matchDeliveryItems, {
        organizationId,
        deliveryId,
      });

    const row2 = (await db.get("warehouseDeliveries", deliveryId)) as Record<
      string,
      unknown
    > | null;
    // analysisResult still intact after second run
    expect(
      (row2?.analysisResult as Record<string, unknown>)?.invoiceNumber,
    ).toBe("FV/2024/001");
    // matchingProposals updated (matchedAt may differ but items shape is same)
    expect(row2?.matchingProposals).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Part B2 — saved name mappings (#3053)
// ---------------------------------------------------------------------------

describe("matchInvoiceItems — saved mappings are priority #1", () => {
  test("saved mapping wins over exact name match", () => {
    const savedMappings = new Map([["rękawiczki nitrylowe", "p-saved"]]);
    const result = matchInvoiceItems(
      [makeItem("Rękawiczki nitrylowe")],
      [
        { productId: "p-saved", productName: "Rękawiczki nitrylowe" },
        { productId: "p-catalog", productName: "Rękawiczki nitrylowe" },
      ],
      savedMappings,
    );
    expect(result.items[0].status).toBe("matched");
    expect(result.items[0].matched?.matchReason).toBe("saved_mapping");
    expect(result.items[0].matched?.productId).toBe("p-saved");
  });

  test("saved mapping is skipped when mapped product is no longer active", () => {
    const savedMappings = new Map([["stylage xl 1 ml", "p-deleted"]]);
    // p-deleted is not in the active products list
    const result = matchInvoiceItems(
      [makeItem("Stylage XL 1 ml")],
      [{ productId: "p-current", productName: "Stylage XL 1 ml" }],
      savedMappings,
    );
    // Falls through to exact name match since saved product is gone
    expect(result.items[0].status).toBe("matched");
    expect(result.items[0].matched?.matchReason).toBe("exact_name");
    expect(result.items[0].matched?.productId).toBe("p-current");
  });

  test("saved mapping normalises the key (case and whitespace)", () => {
    const savedMappings = new Map([["rękawiczki nitrylowe", "p1"]]);
    const result = matchInvoiceItems(
      [makeItem("  RĘKAWICZKI  NITRYLOWE  ")],
      [{ productId: "p1", productName: "Rękawiczki nitrylowe" }],
      savedMappings,
    );
    expect(result.items[0].status).toBe("matched");
    expect(result.items[0].matched?.matchReason).toBe("saved_mapping");
  });
});

describe("matchDeliveryItems action — saved name mappings persistence", () => {
  test("exact-name match is written to deliveryNameMappings on first run", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const productId = await seedProduct(
      String(organizationId),
      String(userId),
      "Rękawiczki nitrylowe",
    );
    const deliveryId = await seedDeliveryWithAnalysis(
      String(organizationId),
      String(userId),
      [makeItem("Rękawiczki nitrylowe")],
    );

    await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.matchDeliveryItems, {
        organizationId,
        deliveryId,
      });

    const db = createSupabaseDb();
    const mappings = await db
      .query("deliveryNameMappings")
      .eq("organizationId", String(organizationId))
      .collect();
    expect(mappings).toHaveLength(1);
    expect(String((mappings[0] as Record<string, unknown>).invoiceName)).toBe(
      "Rękawiczki nitrylowe",
    );
    expect(String((mappings[0] as Record<string, unknown>).productId)).toBe(productId);
  });

  test("second run returns saved_mapping matchReason", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    await seedProduct(String(organizationId), String(userId), "Rękawiczki nitrylowe");
    const deliveryId = await seedDeliveryWithAnalysis(
      String(organizationId),
      String(userId),
      [makeItem("Rękawiczki nitrylowe")],
    );

    // First run writes the mapping
    await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.matchDeliveryItems, {
        organizationId,
        deliveryId,
      });

    // Second delivery with the same invoice name
    const deliveryId2 = await seedDeliveryWithAnalysis(
      String(organizationId),
      String(userId),
      [makeItem("Rękawiczki nitrylowe")],
    );

    const proposals2 = (await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.matchDeliveryItems, {
        organizationId,
        deliveryId: deliveryId2,
      })) as MatchingProposals;

    expect(proposals2.items[0].status).toBe("matched");
    expect(proposals2.items[0].matched?.matchReason).toBe("saved_mapping");
  });
});

describe("matchDeliveryItems action — throws when analysis not completed", () => {
  test("throws if analysisStatus is not completed", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const db = createSupabaseDb();
    const deliveryId = await db.insert("warehouseDeliveries", {
      organizationId: String(organizationId),
      supplierName: null,
      invoiceNumber: null,
      deliveryDate: null,
      locationId: null,
      notes: null,
      status: "draft",
      totalValue: null,
      totalValueGross: null,
      invoicePages: [{ storageId: "s1", mimeType: "image/jpeg", position: 1 }],
      analysisStatus: "processing",
      analysisResult: null,
      analysisCompletedAt: null,
      analysisError: null,
      createdBy: String(userId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      t
        .withIdentity(identity)
        .action(api.warehouseDeliveries.matchDeliveryItems, {
          organizationId,
          deliveryId,
        }),
    ).rejects.toThrow(/analysis must be completed/i);
  });
});
