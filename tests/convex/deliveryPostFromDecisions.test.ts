// Tests for postDeliveryFromDecisions (#3073).
//
// Covers the scenarios required by the issue:
// 1. All resolved inventory items → correct delivery lines + stock movements
// 2. Non-inventory items → no delivery line, no stock movement
// 3. Unresolved items (null decision) block posting
// 4. create_later items block posting
// 5. Repeated submission: already-posted delivery throws (idempotency)
// 6. Posted delivery cannot be modified via saveItemDecisions
// 7. Organization isolation: wrong org throws
// 8. Permission isolation: viewer role throws

import { describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";
import {
  PRODUCT_A_ID,
  PRODUCT_B_ID,
  SAMPLE_ANALYSIS,
  makeInvoiceItem,
  seedDeliveryWithDecisions,
  seedProducts,
} from "./_delivery_helpers";
import type { MatchingProposals } from "../../convex/_ai/invoiceMatching";

// postDeliveryFromDecisions statically imports getDocumentAnalyzer which
// chains to openai (not installed in tests).  Mock it out.
vi.mock("../../convex/_ai/documentAnalyzer", () => ({
  getDocumentAnalyzer: () => ({ analyzeInvoice: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Scenario 1 — all resolved inventory items create correct delivery lines
// ---------------------------------------------------------------------------

describe("postDeliveryFromDecisions — scenario 1: inventory items create delivery lines", () => {
  test("creates delivery lines with OCR quantity and price data for accepted/choose_product decisions", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));
    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId));

    const result = await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.postDeliveryFromDecisions, {
        organizationId,
        deliveryId,
      });

    // 2 inventory items (accepted + choose_product); 1 non_inventory skipped
    expect(result.movementsCreated).toBe(2);

    const db = createSupabaseDb();
    const items = (await db
      .query("warehouseDeliveryItems")
      .eq("deliveryId", deliveryId)
      .collect()) as Array<Record<string, unknown>>;

    expect(items).toHaveLength(2);

    const itemA = items.find((i) => String(i.productId) === PRODUCT_A_ID);
    const itemB = items.find((i) => String(i.productId) === PRODUCT_B_ID);

    expect(itemA).toBeDefined();
    expect(Number(itemA!.quantity)).toBe(10);
    expect(Number(itemA!.unitPrice)).toBe(4.5);
    expect(String(itemA!.vatCode)).toBe("23");
    expect(Number(itemA!.unitPriceGross)).toBe(5.54);

    expect(itemB).toBeDefined();
    expect(Number(itemB!.quantity)).toBe(2);
    expect(String(itemB!.lotNumber)).toBe("LOT-2024-A");
    expect(String(itemB!.expiryDate)).toBe("2026-06-30");
  });

  test("delivery is marked posted after successful post", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));
    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId));

    await t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId,
      deliveryId,
    });

    const db = createSupabaseDb();
    const row = (await db.get("warehouseDeliveries", deliveryId)) as Record<string, unknown>;
    expect(row.status).toBe("posted");
  });

  test("each inventory line has a movementId after posting", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));
    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId));

    await t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId,
      deliveryId,
    });

    const db = createSupabaseDb();
    const items = (await db
      .query("warehouseDeliveryItems")
      .eq("deliveryId", deliveryId)
      .collect()) as Array<Record<string, unknown>>;

    for (const item of items) {
      expect(item.movementId).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — non-inventory items do not create delivery lines
// ---------------------------------------------------------------------------

describe("postDeliveryFromDecisions — scenario 2: non-inventory items excluded", () => {
  test("non_inventory decision produces no delivery line and no stock movement", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));

    // All three items are non_inventory
    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId), {
      decisions: [
        { type: "non_inventory" },
        { type: "non_inventory" },
        { type: "non_inventory" },
      ],
    });

    const result = await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.postDeliveryFromDecisions, {
        organizationId,
        deliveryId,
      });

    expect(result.movementsCreated).toBe(0);

    const db = createSupabaseDb();
    const items = (await db
      .query("warehouseDeliveryItems")
      .eq("deliveryId", deliveryId)
      .collect()) as Array<Record<string, unknown>>;

    expect(items).toHaveLength(0);

    const delivery = (await db.get("warehouseDeliveries", deliveryId)) as Record<string, unknown>;
    expect(delivery.status).toBe("posted");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — unresolved items block posting
// ---------------------------------------------------------------------------

describe("postDeliveryFromDecisions — scenario 3: unresolved items block", () => {
  test("throws when any decision is null", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));

    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId), {
      decisions: [
        { type: "accepted", productId: PRODUCT_A_ID },
        null, // unresolved
        { type: "non_inventory" },
      ],
    });

    await expect(
      t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
        organizationId,
        deliveryId,
      }),
    ).rejects.toThrow(/nierozwiązane pozycje/i);
  });

  test("throws when no itemDecisions exist", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));

    const db = createSupabaseDb();
    const deliveryId = await db.insert("warehouseDeliveries", {
      organizationId: String(organizationId),
      supplierName: "ACME",
      invoiceNumber: "FV/2024/100",
      deliveryDate: null,
      locationId: null,
      notes: null,
      status: "draft",
      totalValue: null,
      totalValueGross: null,
      invoicePages: null,
      analysisStatus: "completed",
      analysisResult: SAMPLE_ANALYSIS,
      analysisCompletedAt: Date.now(),
      analysisError: null,
      matchingProposals: null,
      itemDecisions: null,
      createdBy: String(userId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
        organizationId,
        deliveryId,
      }),
    ).rejects.toThrow(/no item decisions/i);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — create_later items block posting
// ---------------------------------------------------------------------------

describe("postDeliveryFromDecisions — scenario 4: create_later blocks posting", () => {
  test("throws when any decision is create_later", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));

    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId), {
      decisions: [
        { type: "accepted", productId: PRODUCT_A_ID },
        { type: "create_later", createLaterType: "treatment_product" },
        { type: "non_inventory" },
      ],
    });

    await expect(
      t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
        organizationId,
        deliveryId,
      }),
    ).rejects.toThrow(/utwórz później/i);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — repeated submission does not duplicate
// ---------------------------------------------------------------------------

describe("postDeliveryFromDecisions — scenario 5: idempotency", () => {
  test("second call throws 'already posted'", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));
    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId));

    await t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId,
      deliveryId,
    });

    await expect(
      t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
        organizationId,
        deliveryId,
      }),
    ).rejects.toThrow(/already posted/i);
  });

  test("single post creates exactly 2 stock movements for 2 inventory items", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));
    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId));

    const result = await t.withIdentity(identity).action(
      api.warehouseDeliveries.postDeliveryFromDecisions,
      { organizationId, deliveryId },
    );

    expect(result.movementsCreated).toBe(2);

    const db = createSupabaseDb();
    const movements = (await db
      .query("productStockMovements")
      .eq("sourceId", deliveryId)
      .collect()) as Array<Record<string, unknown>>;

    expect(movements).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — posted delivery cannot be modified
// ---------------------------------------------------------------------------

describe("postDeliveryFromDecisions — scenario 6: posted delivery is immutable", () => {
  test("saveItemDecisions throws on a posted delivery", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));
    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId));

    await t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId,
      deliveryId,
    });

    await expect(
      t.withIdentity(identity).action(api.warehouseDeliveries.saveItemDecisions, {
        organizationId,
        deliveryId,
        decisions: {
          decidedAt: Date.now(),
          items: [{ type: "non_inventory" }, { type: "non_inventory" }, { type: "non_inventory" }],
        },
      }),
    ).rejects.toThrow(/cannot modify a posted delivery/i);
  });

  test("updateDelivery throws on a posted delivery", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));
    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId));

    await t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId,
      deliveryId,
    });

    await expect(
      t.withIdentity(identity).action(api.warehouseDeliveries.updateDelivery, {
        organizationId,
        deliveryId,
        supplierName: "Hacker",
      }),
    ).rejects.toThrow(/only draft deliveries can be edited/i);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — organization isolation
// ---------------------------------------------------------------------------

describe("postDeliveryFromDecisions — scenario 7: org isolation", () => {
  test("throws when deliveryId belongs to another org", async () => {
    const t = createTestCtx();
    const { organizationId: org1, userId: user1 } = await seedTestUser(t);
    const { organizationId: org2, identity: identity2 } = await seedTestUser(t);

    await seedProducts(String(org1));
    const deliveryId = await seedDeliveryWithDecisions(String(org1), String(user1));

    await expect(
      t.withIdentity(identity2).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
        organizationId: org2,
        deliveryId,
      }),
    ).rejects.toThrow(/delivery not found/i);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — permission isolation
// ---------------------------------------------------------------------------

describe("postDeliveryFromDecisions — scenario 8: permission check", () => {
  test("throws when caller lacks gabinet_inventory edit permission", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const { identity: viewerIdentity } = await seedTestUser(t, { role: "viewer" });

    await seedProducts(String(organizationId));
    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId));

    await expect(
      t
        .withIdentity(viewerIdentity)
        .action(api.warehouseDeliveries.postDeliveryFromDecisions, {
          organizationId,
          deliveryId,
        }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 — name mapping learning from approved decisions (#3077)
// ---------------------------------------------------------------------------

describe("postDeliveryFromDecisions — scenario 9: name mapping learning", () => {
  test("accepted and choose_product decisions save name mappings after successful post", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));
    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId));

    await t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId,
      deliveryId,
    });

    const db = createSupabaseDb();
    const mappings = (await db
      .query("deliveryNameMappings")
      .eq("organizationId", String(organizationId))
      .collect()) as Array<Record<string, unknown>>;

    // "Rękawiczki nitrylowe" (accepted) and "Stylage XL 1 ml" (choose_product) → saved
    // "Transport" (non_inventory) → not saved
    expect(mappings).toHaveLength(2);
    const names = mappings.map((m) => String(m.invoiceName));
    expect(names).toContain("Rękawiczki nitrylowe");
    expect(names).toContain("Stylage XL 1 ml");
    expect(names).not.toContain("Transport");
  });

  test("non_inventory decision does not create a name mapping", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));

    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId), {
      decisions: [
        { type: "non_inventory" },
        { type: "non_inventory" },
        { type: "non_inventory" },
      ],
    });

    await t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId,
      deliveryId,
    });

    const db = createSupabaseDb();
    const mappings = await db
      .query("deliveryNameMappings")
      .eq("organizationId", String(organizationId))
      .collect();

    expect(mappings).toHaveLength(0);
  });

  test("unresolved (null) decision blocks posting and no mapping is saved", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));

    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId), {
      decisions: [
        { type: "accepted", productId: PRODUCT_A_ID },
        null,
        { type: "non_inventory" },
      ],
    });

    await expect(
      t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
        organizationId,
        deliveryId,
      }),
    ).rejects.toThrow(/nierozwiązane pozycje/i);

    const db = createSupabaseDb();
    const mappings = await db
      .query("deliveryNameMappings")
      .eq("organizationId", String(organizationId))
      .collect();

    expect(mappings).toHaveLength(0);
  });

  test("create_later decision blocks posting and no mapping is saved", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));

    const deliveryId = await seedDeliveryWithDecisions(String(organizationId), String(userId), {
      decisions: [
        { type: "accepted", productId: PRODUCT_A_ID },
        { type: "create_later", createLaterType: "treatment_product" },
        { type: "non_inventory" },
      ],
    });

    await expect(
      t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
        organizationId,
        deliveryId,
      }),
    ).rejects.toThrow(/utwórz później/i);

    const db = createSupabaseDb();
    const mappings = await db
      .query("deliveryNameMappings")
      .eq("organizationId", String(organizationId))
      .collect();

    expect(mappings).toHaveLength(0);
  });

  test("manual override: posting with a different product updates the existing mapping", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));

    // First delivery: "Rękawiczki nitrylowe" → PRODUCT_A_ID
    const deliveryId1 = await seedDeliveryWithDecisions(String(organizationId), String(userId), {
      decisions: [
        { type: "accepted", productId: PRODUCT_A_ID },
        { type: "non_inventory" },
        { type: "non_inventory" },
      ],
    });
    await t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId,
      deliveryId: deliveryId1,
    });

    // Second delivery: same invoice name "Rękawiczki nitrylowe" → PRODUCT_B_ID (override)
    const deliveryId2 = await seedDeliveryWithDecisions(String(organizationId), String(userId), {
      decisions: [
        { type: "choose_product", productId: PRODUCT_B_ID },
        { type: "non_inventory" },
        { type: "non_inventory" },
      ],
    });
    await t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId,
      deliveryId: deliveryId2,
    });

    const db = createSupabaseDb();
    const mappings = (await db
      .query("deliveryNameMappings")
      .eq("organizationId", String(organizationId))
      .eq("invoiceName", "Rękawiczki nitrylowe")
      .collect()) as Array<Record<string, unknown>>;

    expect(mappings).toHaveLength(1);
    expect(String(mappings[0].productId)).toBe(PRODUCT_B_ID);
  });

  test("mapping is org-scoped: posting in org1 does not create mappings for org2", async () => {
    const t = createTestCtx();
    const { organizationId: org1, userId: user1, identity: identity1 } = await seedTestUser(t);
    const { organizationId: org2 } = await seedTestUser(t);

    await seedProducts(String(org1));
    const deliveryId = await seedDeliveryWithDecisions(String(org1), String(user1));

    await t.withIdentity(identity1).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId: org1,
      deliveryId,
    });

    const db = createSupabaseDb();
    const org2Mappings = await db
      .query("deliveryNameMappings")
      .eq("organizationId", String(org2))
      .collect();

    expect(org2Mappings).toHaveLength(0);
  });

  test("posting two deliveries with same invoice names does not create duplicate mappings", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));

    const deliveryId1 = await seedDeliveryWithDecisions(String(organizationId), String(userId));
    await t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId,
      deliveryId: deliveryId1,
    });

    const deliveryId2 = await seedDeliveryWithDecisions(String(organizationId), String(userId));
    await t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId,
      deliveryId: deliveryId2,
    });

    const db = createSupabaseDb();
    const mappings = await db
      .query("deliveryNameMappings")
      .eq("organizationId", String(organizationId))
      .collect();

    // Still exactly 2 (one per inventory invoice name), no duplicates
    expect(mappings).toHaveLength(2);
  });

  test("future matchDeliveryItems uses the mapping saved by postDeliveryFromDecisions", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedProducts(String(organizationId));

    // Invoice name that has no exact or fuzzy match to any product name
    // "Rękawiczki latex" vs "Rękawiczki nitrylowe": Jaccard = 1/3 < 0.5 → unmatched
    const invoiceName = "Rękawiczki latex";

    const db = createSupabaseDb();
    const deliveryId1 = await db.insert("warehouseDeliveries", {
      organizationId: String(organizationId),
      supplierName: "ACME",
      invoiceNumber: "FV/2024/200",
      deliveryDate: null,
      locationId: null,
      notes: null,
      status: "draft",
      totalValue: null,
      totalValueGross: null,
      invoicePages: [{ storageId: "store-p1", mimeType: "image/jpeg", position: 0 }],
      analysisStatus: "completed",
      analysisResult: {
        supplierName: "ACME",
        invoiceNumber: "FV/2024/200",
        invoiceDate: null,
        items: [makeInvoiceItem(invoiceName)],
        confidence: 0.9,
      },
      analysisCompletedAt: Date.now(),
      analysisError: null,
      matchingProposals: null,
      itemDecisions: {
        decidedAt: Date.now(),
        items: [{ type: "choose_product", productId: PRODUCT_A_ID }],
      },
      createdBy: String(userId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await t.withIdentity(identity).action(api.warehouseDeliveries.postDeliveryFromDecisions, {
      organizationId,
      deliveryId: deliveryId1,
    });

    // Second delivery with the same invoice name — matching should now use the saved mapping
    const deliveryId2 = await db.insert("warehouseDeliveries", {
      organizationId: String(organizationId),
      supplierName: "ACME",
      invoiceNumber: "FV/2024/201",
      deliveryDate: null,
      locationId: null,
      notes: null,
      status: "draft",
      totalValue: null,
      totalValueGross: null,
      invoicePages: [{ storageId: "store-p2", mimeType: "image/jpeg", position: 0 }],
      analysisStatus: "completed",
      analysisResult: {
        supplierName: "ACME",
        invoiceNumber: "FV/2024/201",
        invoiceDate: null,
        items: [makeInvoiceItem(invoiceName)],
        confidence: 0.9,
      },
      analysisCompletedAt: Date.now(),
      analysisError: null,
      matchingProposals: null,
      itemDecisions: null,
      createdBy: String(userId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const proposals = (await t
      .withIdentity(identity)
      .action(api.warehouseDeliveries.matchDeliveryItems, {
        organizationId,
        deliveryId: deliveryId2,
      })) as MatchingProposals;

    expect(proposals.items).toHaveLength(1);
    expect(proposals.items[0].status).toBe("matched");
    expect(proposals.items[0].matched?.matchReason).toBe("saved_mapping");
    expect(proposals.items[0].matched?.productId).toBe(PRODUCT_A_ID);
  });
});
