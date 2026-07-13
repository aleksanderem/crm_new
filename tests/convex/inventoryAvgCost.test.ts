import { describe, expect, test } from "vitest";
import { applyMovementInternal } from "../../convex/inventory";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

const ORG_ID = "org-test-avg-123";
const PRODUCT_ID = "prod-test-avg-abc";
const PERFORMER = "user-test-avg-xyz";

async function seedProduct(trackStock = true) {
  const db = createSupabaseDb();
  await db.insert("products", {
    _id: PRODUCT_ID,
    organizationId: ORG_ID,
    name: "Test Product",
    sku: "TEST-AVG-001",
    unitPrice: 10,
    isActive: true,
    trackStock,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function getStockLevel(): Promise<Record<string, unknown> | null> {
  const db = createSupabaseDb();
  const rows = (await db
    .query("productStockLevels")
    .eq("productId", PRODUCT_ID)
    .collect()) as Array<Record<string, unknown>>;
  return rows.find((r) => (r.locationId ?? null) === null) ?? null;
}

describe("applyMovementInternal — weighted average purchase price (#2979)", () => {
  test("first receipt with no existing stock level sets avgCost to unit price", async () => {
    await seedProduct();

    const result = await applyMovementInternal({
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      locationId: null,
      delta: 10,
      reason: "warehouse_receive",
      unitPrice: 8.0,
      performedBy: PERFORMER,
    });

    expect(result.balanceAfter).toBe(10);
    const level = await getStockLevel();
    expect(level).not.toBeNull();
    expect(level?.avgCost).toBe(8.0);
  });

  test("receipt when previous balance is zero resets avgCost to unit price (zero previous balance edge case)", async () => {
    await seedProduct();
    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      quantity: 0,
      avgCost: 5.0,
      updatedAt: Date.now(),
    });

    await applyMovementInternal({
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      locationId: null,
      delta: 5,
      reason: "warehouse_receive",
      unitPrice: 12.0,
      performedBy: PERFORMER,
    });

    const level = await getStockLevel();
    expect(level?.avgCost).toBe(12.0);
    expect(level?.quantity).toBe(5);
  });

  test("receipt when existing avgCost is null resets avgCost to unit price (null previous avg edge case)", async () => {
    await seedProduct();
    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      quantity: 20,
      // avgCost intentionally omitted — simulates stock seeded before price tracking was added
      updatedAt: Date.now(),
    });

    await applyMovementInternal({
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      locationId: null,
      delta: 10,
      reason: "warehouse_receive",
      unitPrice: 7.0,
      performedBy: PERFORMER,
    });

    const level = await getStockLevel();
    expect(level?.avgCost).toBe(7.0);
    expect(level?.quantity).toBe(30);
  });

  test("normal receipt applies weighted average formula correctly", async () => {
    await seedProduct();
    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      quantity: 10,
      avgCost: 5.0,
      updatedAt: Date.now(),
    });

    await applyMovementInternal({
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      locationId: null,
      delta: 5,
      reason: "warehouse_receive",
      unitPrice: 8.0,
      performedBy: PERFORMER,
    });

    // (10 * 5.00 + 5 * 8.00) / (10 + 5) = (50 + 40) / 15 = 6.00
    const level = await getStockLevel();
    expect(level?.quantity).toBe(15);
    expect(level?.avgCost).toBeCloseTo(6.0, 10);
  });

  test("negative delta does not update avgCost even for warehouse_receive", async () => {
    await seedProduct();
    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      quantity: 10,
      avgCost: 5.0,
      updatedAt: Date.now(),
    });

    await applyMovementInternal({
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      locationId: null,
      delta: -3,
      reason: "warehouse_receive",
      unitPrice: 9.0,
      performedBy: PERFORMER,
    });

    const level = await getStockLevel();
    expect(level?.quantity).toBe(7);
    // avgCost must stay unchanged because resolvedDelta was not positive
    expect(level?.avgCost).toBe(5.0);
  });

  test("non-warehouse reason does not update avgCost", async () => {
    await seedProduct();
    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      quantity: 10,
      avgCost: 5.0,
      updatedAt: Date.now(),
    });

    await applyMovementInternal({
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      locationId: null,
      delta: 5,
      reason: "manual_adjust",
      unitPrice: 9.0,
      performedBy: PERFORMER,
    });

    const level = await getStockLevel();
    expect(level?.quantity).toBe(15);
    expect(level?.avgCost).toBe(5.0);
  });

  test("warehouse_receive without unitPrice does not update avgCost", async () => {
    await seedProduct();
    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      quantity: 10,
      avgCost: 5.0,
      updatedAt: Date.now(),
    });

    await applyMovementInternal({
      organizationId: ORG_ID,
      productId: PRODUCT_ID,
      locationId: null,
      delta: 5,
      reason: "warehouse_receive",
      // unitPrice intentionally omitted
      performedBy: PERFORMER,
    });

    const level = await getStockLevel();
    expect(level?.quantity).toBe(15);
    expect(level?.avgCost).toBe(5.0);
  });
});
