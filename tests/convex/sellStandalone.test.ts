import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedSecondUser,
  seedTestUser,
} from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";
import { applyMovementInternal } from "../../convex/inventory";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const PRODUCT_ID = "prod-sell-standalone-001";

async function seedTrackedProduct(organizationId: string) {
  const db = createSupabaseDb();
  await db.insert("products", {
    _id: PRODUCT_ID,
    organizationId,
    name: "Sell Test Product",
    sku: "SELL-001",
    unitPrice: 25,
    isActive: true,
    trackStock: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function getStockLevel() {
  const db = createSupabaseDb();
  const rows = (await db
    .query("productStockLevels")
    .eq("productId", PRODUCT_ID)
    .collect()) as Array<Record<string, unknown>>;
  return rows.find((r) => (r.locationId ?? null) === null) ?? null;
}

describe("sellProductStandalone (#5599)", () => {
  test("deducts stock and returns negativeStock:false when sufficient stock exists", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      quantity: 10,
      updatedAt: Date.now(),
    });

    const result = await t.withIdentity(identity).action(
      api["magazyn/movements"].sellProductStandalone,
      {
        organizationId: String(organizationId),
        productId: PRODUCT_ID,
        quantity: 3,
        salePrice: 25,
        locationId: null,
      },
    );

    expect(result.negativeStock).toBe(false);

    const level = await getStockLevel();
    expect(Number(level?.quantity)).toBe(7);
  });

  test("returns negativeStock:true when sale pushes balance below zero", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    // No stock level seeded — starting balance is 0; selling 5 units → balance -5.
    const result = await t.withIdentity(identity).action(
      api["magazyn/movements"].sellProductStandalone,
      {
        organizationId: String(organizationId),
        productId: PRODUCT_ID,
        quantity: 5,
        salePrice: 25,
        locationId: null,
      },
    );

    expect(result.negativeStock).toBe(true);

    const level = await getStockLevel();
    expect(Number(level?.quantity)).toBe(-5);
  });

  test("throws Permission denied for member role (gabinet_inventory blocked by default)", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    const { identity: memberIdentity } = await seedSecondUser(
      t,
      organizationId,
      { role: "member" },
    );
    await seedTrackedProduct(String(organizationId));

    await expect(
      t.withIdentity(memberIdentity).action(
        api["magazyn/movements"].sellProductStandalone,
        {
          organizationId: String(organizationId),
          productId: PRODUCT_ID,
          quantity: 1,
          salePrice: 25,
          locationId: null,
        },
      ),
    ).rejects.toThrow("Permission denied");
  });
});

describe("sellReturnStandalone (#5599)", () => {
  test("increases stock and returns movementId + correct balanceAfter", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      quantity: 5,
      updatedAt: Date.now(),
    });

    const result = await t.withIdentity(identity).action(
      api["magazyn/movements"].sellReturnStandalone,
      {
        organizationId: String(organizationId),
        productId: PRODUCT_ID,
        quantity: 2,
        salePrice: 25,
        locationId: null,
      },
    );

    expect(result.movementId).toBeTruthy();
    expect(result.balanceAfter).toBe(7); // 5 + 2

    const level = await getStockLevel();
    expect(Number(level?.quantity)).toBe(7);
  });

  test("movement row carries positive delta and reason direct_sale_return", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    const result = await t.withIdentity(identity).action(
      api["magazyn/movements"].sellReturnStandalone,
      {
        organizationId: String(organizationId),
        productId: PRODUCT_ID,
        quantity: 3,
        salePrice: 20,
        locationId: null,
        note: "Customer changed mind",
      },
    );

    const db = createSupabaseDb();
    const movements = (await db
      .query("productStockMovements")
      .eq("productId", PRODUCT_ID)
      .collect()) as Array<Record<string, unknown>>;
    const mv = movements.find((m) => m.id === result.movementId);

    expect(mv).toBeTruthy();
    expect(Number(mv?.delta)).toBe(3);
    expect(mv?.reason).toBe("direct_sale_return");
  });

  test("throws Permission denied for member role (gabinet_inventory blocked by default)", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    const { identity: memberIdentity } = await seedSecondUser(
      t,
      organizationId,
      { role: "member" },
    );
    await seedTrackedProduct(String(organizationId));

    await expect(
      t.withIdentity(memberIdentity).action(
        api["magazyn/movements"].sellReturnStandalone,
        {
          organizationId: String(organizationId),
          productId: PRODUCT_ID,
          quantity: 1,
          salePrice: 25,
          locationId: null,
        },
      ),
    ).rejects.toThrow("Permission denied");
  });
});

describe("sellProductStandalone — FEFO lot selection (#5600)", () => {
  test("single lot: deduction movement carries lotNumber and expiryDate", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    // Seed a lot receipt so selectFefoLotsForProduct finds it.
    await applyMovementInternal({
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      locationId: null,
      delta: 10,
      reason: "warehouse_receive",
      lotNumber: "LOT-A",
      expiryDate: "2026-12-31",
      performedBy: "system",
    });

    const result = await t.withIdentity(identity).action(
      api["magazyn/movements"].sellProductStandalone,
      {
        organizationId: String(organizationId),
        productId: PRODUCT_ID,
        quantity: 4,
        salePrice: 25,
        locationId: null,
      },
    );

    expect(result.negativeStock).toBe(false);

    const db = createSupabaseDb();
    const saleMoves = (await db
      .query("productStockMovements")
      .eq("productId", PRODUCT_ID)
      .eq("reason", "direct_sale")
      .collect()) as Array<Record<string, unknown>>;
    expect(saleMoves).toHaveLength(1);
    expect(saleMoves[0].lotNumber).toBe("LOT-A");
    expect(saleMoves[0].expiryDate).toBe("2026-12-31");
    expect(Number(saleMoves[0].delta)).toBe(-4);
  });

  test("two lots: earliest-expiring lot is consumed first (FEFO order)", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    // LOT-A expires later; LOT-B expires sooner → LOT-B should be drained first.
    await applyMovementInternal({
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      locationId: null,
      delta: 5,
      reason: "warehouse_receive",
      lotNumber: "LOT-A",
      expiryDate: "2026-12-01",
      performedBy: "system",
    });
    await applyMovementInternal({
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      locationId: null,
      delta: 5,
      reason: "warehouse_receive",
      lotNumber: "LOT-B",
      expiryDate: "2026-06-01",
      performedBy: "system",
    });

    await t.withIdentity(identity).action(
      api["magazyn/movements"].sellProductStandalone,
      {
        organizationId: String(organizationId),
        productId: PRODUCT_ID,
        quantity: 3,
        salePrice: 25,
        locationId: null,
      },
    );

    const db = createSupabaseDb();
    const saleMoves = (await db
      .query("productStockMovements")
      .eq("productId", PRODUCT_ID)
      .eq("reason", "direct_sale")
      .collect()) as Array<Record<string, unknown>>;
    expect(saleMoves).toHaveLength(1);
    expect(saleMoves[0].lotNumber).toBe("LOT-B");
    expect(Number(saleMoves[0].delta)).toBe(-3);
  });

  test("lot exhaustion: remainder written as unlotted direct_sale movement", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    // Only 3 units in LOT-A; selling 5 should drain the lot then deduct 2 without lot.
    await applyMovementInternal({
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      locationId: null,
      delta: 3,
      reason: "warehouse_receive",
      lotNumber: "LOT-A",
      expiryDate: "2026-12-31",
      performedBy: "system",
    });

    const result = await t.withIdentity(identity).action(
      api["magazyn/movements"].sellProductStandalone,
      {
        organizationId: String(organizationId),
        productId: PRODUCT_ID,
        quantity: 5,
        salePrice: 25,
        locationId: null,
      },
    );

    // Balance was 3, deducting 5 → -2 (warn-and-allow policy).
    expect(result.negativeStock).toBe(true);

    const db = createSupabaseDb();
    const saleMoves = (await db
      .query("productStockMovements")
      .eq("productId", PRODUCT_ID)
      .eq("reason", "direct_sale")
      .collect()) as Array<Record<string, unknown>>;
    expect(saleMoves).toHaveLength(2);
    const lotMove = saleMoves.find((m) => m.lotNumber != null);
    const unlottedMove = saleMoves.find((m) => m.lotNumber == null);
    expect(lotMove).toBeTruthy();
    expect(Number(lotMove!.delta)).toBe(-3);
    expect(unlottedMove).toBeTruthy();
    expect(Number(unlottedMove!.delta)).toBe(-2);
  });

  test("throws when quantity is zero or negative", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    await expect(
      t.withIdentity(identity).action(
        api["magazyn/movements"].sellProductStandalone,
        {
          organizationId: String(organizationId),
          productId: PRODUCT_ID,
          quantity: 0,
          salePrice: 25,
          locationId: null,
        },
      ),
    ).rejects.toThrow("Quantity must be positive");
  });

  test("throws when salePrice is negative", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    await expect(
      t.withIdentity(identity).action(
        api["magazyn/movements"].sellProductStandalone,
        {
          organizationId: String(organizationId),
          productId: PRODUCT_ID,
          quantity: 1,
          salePrice: -5,
          locationId: null,
        },
      ),
    ).rejects.toThrow("Sale price must be non-negative");
  });
});
