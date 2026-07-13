// Tests for per-item decision persistence on warehouse deliveries (#3055).
//
// Covers the 7 scenarios required by the issue:
// 1. Auto-matched item — decision pre-populated from matchingProposals
// 2. Multiple proposals (suggestions) — save choose_product decision
// 3. No match (unmatched) — save create_later decision
// 4. Non-inventory candidate — save non_inventory decision
// 5. Create-later with product type — full decision persisted
// 6. Save and re-read — itemDecisions persists separately from analysisResult/matchingProposals
// 7. Block on unresolved — backend stores decisions as-is; UI enforces the
//    block; the action must reject posted deliveries (irreversibility guard)

import { describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

// saveItemDecisions does not use the document analyzer, but warehouseDeliveries.ts
// statically imports getDocumentAnalyzer which chains to openai (not installed in tests).
// Mock it to avoid the missing-package error, matching the pattern in
// deliveryInvoiceAnalysis.test.ts.
vi.mock("../../convex/_ai/documentAnalyzer", () => ({
  getDocumentAnalyzer: () => ({ analyzeInvoice: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_PROPOSALS = {
  matchedAt: Date.now(),
  items: [
    {
      invoiceName: "Rękawiczki nitrylowe",
      status: "matched",
      matched: { productId: "p-gloves", productName: "Rękawiczki nitrylowe", matchReason: "exact_name" },
    },
    {
      invoiceName: "Stylage XL 1 ml",
      status: "suggestions",
      suggestions: [
        { productId: "p-sxl", productName: "Stylage XL 1 ml", matchReason: "similar_name" },
        { productId: "p-sl",  productName: "Stylage L 1 ml",  matchReason: "similar_name" },
      ],
    },
    {
      invoiceName: "Całkowicie nieznany preparat",
      status: "unmatched",
    },
    {
      invoiceName: "Transport",
      status: "non_inventory_candidate",
      handlingHint: "Pozycja niemagazynowa (transport/usługa)",
    },
  ],
};

const SAMPLE_ANALYSIS_RESULT = {
  supplierName: "ACME Sp. z o.o.",
  invoiceNumber: "FV/2024/099",
  invoiceDate: "2024-03-10",
  items: SAMPLE_PROPOSALS.items.map((i) => ({
    productName: i.invoiceName,
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
  })),
  confidence: 0.91,
};

async function seedDeliveryWithProposals(
  organizationId: string,
  userId: string,
): Promise<string> {
  const db = createSupabaseDb();
  return db.insert("warehouseDeliveries", {
    organizationId,
    supplierName: "ACME Sp. z o.o.",
    invoiceNumber: "FV/2024/099",
    deliveryDate: null,
    locationId: null,
    notes: null,
    status: "draft",
    totalValue: null,
    totalValueGross: null,
    invoicePages: [{ storageId: "store-p1", mimeType: "image/jpeg", position: 0 }],
    analysisStatus: "completed",
    analysisResult: SAMPLE_ANALYSIS_RESULT,
    analysisCompletedAt: Date.now(),
    analysisError: null,
    matchingProposals: SAMPLE_PROPOSALS,
    createdBy: userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Scenario 1 — auto-matched item: save accepted decision
// ---------------------------------------------------------------------------

describe("saveItemDecisions — scenario 1: auto-matched item", () => {
  test("saves accepted decision for a matched item", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const deliveryId = await seedDeliveryWithProposals(String(organizationId), String(userId));

    const decisions = {
      decidedAt: Date.now(),
      items: [
        { type: "accepted", productId: "p-gloves" },
        null,
        null,
        null,
      ],
    };

    await t.withIdentity(identity).action(api.warehouseDeliveries.saveItemDecisions, {
      organizationId,
      deliveryId,
      decisions,
    });

    const db = createSupabaseDb();
    const row = (await db.get("warehouseDeliveries", deliveryId)) as Record<string, unknown> | null;
    const saved = row?.itemDecisions as typeof decisions | null;
    expect(saved).toBeDefined();
    expect((saved!.items[0] as Record<string, unknown>).type).toBe("accepted");
    expect((saved!.items[0] as Record<string, unknown>).productId).toBe("p-gloves");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — multiple suggestions: save choose_product
// ---------------------------------------------------------------------------

describe("saveItemDecisions — scenario 2: multiple proposals (suggestions)", () => {
  test("saves choose_product decision with selected productId", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const deliveryId = await seedDeliveryWithProposals(String(organizationId), String(userId));

    const decisions = {
      decidedAt: Date.now(),
      items: [
        { type: "accepted", productId: "p-gloves" },
        { type: "choose_product", productId: "p-sl" },
        null,
        null,
      ],
    };

    await t.withIdentity(identity).action(api.warehouseDeliveries.saveItemDecisions, {
      organizationId,
      deliveryId,
      decisions,
    });

    const db = createSupabaseDb();
    const row = (await db.get("warehouseDeliveries", deliveryId)) as Record<string, unknown> | null;
    const saved = row?.itemDecisions as typeof decisions | null;
    expect((saved!.items[1] as Record<string, unknown>).type).toBe("choose_product");
    expect((saved!.items[1] as Record<string, unknown>).productId).toBe("p-sl");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — no match: save create_later
// ---------------------------------------------------------------------------

describe("saveItemDecisions — scenario 3: no match (unmatched)", () => {
  test("saves create_later decision with product type", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const deliveryId = await seedDeliveryWithProposals(String(organizationId), String(userId));

    const decisions = {
      decidedAt: Date.now(),
      items: [
        { type: "accepted", productId: "p-gloves" },
        { type: "choose_product", productId: "p-sxl" },
        { type: "create_later", createLaterType: "treatment_product" },
        { type: "non_inventory" },
      ],
    };

    await t.withIdentity(identity).action(api.warehouseDeliveries.saveItemDecisions, {
      organizationId,
      deliveryId,
      decisions,
    });

    const db = createSupabaseDb();
    const row = (await db.get("warehouseDeliveries", deliveryId)) as Record<string, unknown> | null;
    const saved = row?.itemDecisions as typeof decisions | null;
    expect((saved!.items[2] as Record<string, unknown>).type).toBe("create_later");
    expect((saved!.items[2] as Record<string, unknown>).createLaterType).toBe("treatment_product");
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — non-inventory candidate: save non_inventory
// ---------------------------------------------------------------------------

describe("saveItemDecisions — scenario 4: non-inventory candidate", () => {
  test("saves non_inventory decision", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const deliveryId = await seedDeliveryWithProposals(String(organizationId), String(userId));

    const decisions = {
      decidedAt: Date.now(),
      items: [
        { type: "accepted", productId: "p-gloves" },
        { type: "accepted", productId: "p-sxl" },
        { type: "create_later", createLaterType: "disposable" },
        { type: "non_inventory" },
      ],
    };

    await t.withIdentity(identity).action(api.warehouseDeliveries.saveItemDecisions, {
      organizationId,
      deliveryId,
      decisions,
    });

    const db = createSupabaseDb();
    const row = (await db.get("warehouseDeliveries", deliveryId)) as Record<string, unknown> | null;
    const saved = row?.itemDecisions as typeof decisions | null;
    expect((saved!.items[3] as Record<string, unknown>).type).toBe("non_inventory");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — create_later with all product types
// ---------------------------------------------------------------------------

describe("saveItemDecisions — scenario 5: create_later with product type", () => {
  test.each([
    "treatment_product",
    "disposable",
    "sale_product",
    "consumable",
  ] as const)("createLaterType=%s is persisted correctly", async (createLaterType) => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const deliveryId = await seedDeliveryWithProposals(String(organizationId), String(userId));

    const decisions = {
      decidedAt: Date.now(),
      items: [
        { type: "accepted", productId: "p-gloves" },
        { type: "accepted", productId: "p-sxl" },
        { type: "create_later", createLaterType },
        { type: "non_inventory" },
      ],
    };

    await t.withIdentity(identity).action(api.warehouseDeliveries.saveItemDecisions, {
      organizationId,
      deliveryId,
      decisions,
    });

    const db = createSupabaseDb();
    const row = (await db.get("warehouseDeliveries", deliveryId)) as Record<string, unknown> | null;
    const saved = row?.itemDecisions as typeof decisions | null;
    expect((saved!.items[2] as Record<string, unknown>).createLaterType).toBe(createLaterType);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — save and re-read: decisions persist separately
// ---------------------------------------------------------------------------

describe("saveItemDecisions — scenario 6: save and re-read", () => {
  test("itemDecisions is persisted separately from analysisResult and matchingProposals", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const deliveryId = await seedDeliveryWithProposals(String(organizationId), String(userId));

    const decisions = {
      decidedAt: Date.now(),
      items: [
        { type: "accepted", productId: "p-gloves" },
        { type: "choose_product", productId: "p-sxl" },
        { type: "create_later", createLaterType: "sale_product" },
        { type: "non_inventory" },
      ],
    };

    await t.withIdentity(identity).action(api.warehouseDeliveries.saveItemDecisions, {
      organizationId,
      deliveryId,
      decisions,
    });

    const db = createSupabaseDb();
    const row = (await db.get("warehouseDeliveries", deliveryId)) as Record<string, unknown> | null;

    // analysisResult untouched
    expect((row?.analysisResult as Record<string, unknown>)?.invoiceNumber).toBe("FV/2024/099");

    // matchingProposals untouched
    const mp = row?.matchingProposals as { items: unknown[] } | null;
    expect(mp?.items).toHaveLength(4);

    // itemDecisions saved
    const saved = row?.itemDecisions as typeof decisions | null;
    expect(saved?.items).toHaveLength(4);
    expect((saved!.items[0] as Record<string, unknown>).type).toBe("accepted");
    expect((saved!.items[2] as Record<string, unknown>).createLaterType).toBe("sale_product");

    // Re-save with updated decisions — only itemDecisions changes
    const decisions2 = {
      decidedAt: Date.now(),
      items: [
        { type: "non_inventory" },
        { type: "non_inventory" },
        { type: "non_inventory" },
        { type: "non_inventory" },
      ],
    };

    await t.withIdentity(identity).action(api.warehouseDeliveries.saveItemDecisions, {
      organizationId,
      deliveryId,
      decisions: decisions2,
    });

    const row2 = (await db.get("warehouseDeliveries", deliveryId)) as Record<string, unknown> | null;
    // analysisResult still intact after re-save
    expect((row2?.analysisResult as Record<string, unknown>)?.invoiceNumber).toBe("FV/2024/099");
    const saved2 = row2?.itemDecisions as typeof decisions2 | null;
    expect((saved2!.items[0] as Record<string, unknown>).type).toBe("non_inventory");
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — block on posted delivery
// ---------------------------------------------------------------------------

describe("saveItemDecisions — scenario 7: posted delivery is immutable", () => {
  test("throws when attempting to save decisions on a posted delivery", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const db = createSupabaseDb();
    const deliveryId = await db.insert("warehouseDeliveries", {
      organizationId: String(organizationId),
      supplierName: "ACME",
      invoiceNumber: "FV/2024/POSTED",
      deliveryDate: null,
      locationId: null,
      notes: null,
      status: "posted",
      totalValue: null,
      totalValueGross: null,
      invoicePages: null,
      analysisStatus: "completed",
      analysisResult: SAMPLE_ANALYSIS_RESULT,
      analysisCompletedAt: Date.now(),
      analysisError: null,
      matchingProposals: SAMPLE_PROPOSALS,
      createdBy: String(userId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      t.withIdentity(identity).action(api.warehouseDeliveries.saveItemDecisions, {
        organizationId,
        deliveryId,
        decisions: {
          decidedAt: Date.now(),
          items: [{ type: "accepted", productId: "p-gloves" }],
        },
      }),
    ).rejects.toThrow(/cannot modify a posted delivery/i);
  });
});
