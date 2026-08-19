/**
 * Unit tests for the appointment stock deduction flow (#5630).
 *
 * Covers:
 *   - consumeForAppointment: completed → deduction
 *   - consumeForAppointment: idempotency guard prevents double-deduction
 *   - returnStockForAppointment: completed → revert → stock return
 *   - returnStockForAppointment: cancelled (no prior deduction) → no change
 *   - returnStockForAppointment: idempotency guard prevents double-return
 *   - FEFO lot granularity preserved on return
 */

import { afterEach, describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";
import { applyMovementInternal } from "../../convex/inventory";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const PRODUCT_ID = "prod-appt-deduction-001";
const APPOINTMENT_ID = "appt-001";
const TREATMENT_ID = "treat-001";

async function seedTrackedProduct(organizationId: string) {
  const db = createSupabaseDb();
  await db.insert("products", {
    _id: PRODUCT_ID,
    organizationId,
    name: "Deduction Test Product",
    sku: "DEDUCT-001",
    unitPrice: 10,
    isActive: true,
    trackStock: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function getStockLevel(locationId: string | null = null) {
  const db = createSupabaseDb();
  const rows = (await db
    .query("productStockLevels")
    .eq("productId", PRODUCT_ID)
    .collect()) as Array<Record<string, unknown>>;
  return rows.find((r) => (r.locationId ?? null) === locationId) ?? null;
}

async function getMovements(reason?: string) {
  const db = createSupabaseDb();
  let q = db
    .query("productStockMovements")
    .eq("productId", PRODUCT_ID);
  if (reason) q = q.eq("reason", reason);
  return (await q.collect()) as Array<Record<string, unknown>>;
}

describe("consumeForAppointment — completed → deduction (#5630)", () => {
  test("deducts stock when appointment completes and returns negativeStock:false", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      quantity: 10,
      updatedAt: Date.now(),
    });

    const result = await t.action(
      internal.magazyn.movements.consumeForAppointment,
      {
        organizationId: String(organizationId),
        productId: PRODUCT_ID,
        locationId: null,
        totalNeeded: 3,
        appointmentId: APPOINTMENT_ID,
        treatmentId: TREATMENT_ID,
        performedBy: "system",
      },
    );

    expect(result.negativeStock).toBe(false);

    const level = await getStockLevel();
    expect(Number(level?.quantity)).toBe(7);

    const moves = await getMovements("appointment_use");
    expect(moves).toHaveLength(1);
    expect(Number(moves[0].delta)).toBe(-3);
    expect(moves[0].sourceType).toBe("appointment");
    expect(moves[0].sourceId).toBe(APPOINTMENT_ID);
  });

  test("returns negativeStock:true when deduction pushes balance below zero", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    // No stock seeded; starting balance 0, deducting 5 → -5.
    const result = await t.action(
      internal.magazyn.movements.consumeForAppointment,
      {
        organizationId: String(organizationId),
        productId: PRODUCT_ID,
        locationId: null,
        totalNeeded: 5,
        appointmentId: APPOINTMENT_ID,
        performedBy: "system",
      },
    );

    expect(result.negativeStock).toBe(true);

    const level = await getStockLevel();
    expect(Number(level?.quantity)).toBe(-5);
  });
});

describe("consumeForAppointment — idempotency guard (#5630)", () => {
  test("double-fire does not deduct stock a second time", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      quantity: 10,
      updatedAt: Date.now(),
    });

    const args = {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      locationId: null,
      totalNeeded: 2,
      appointmentId: APPOINTMENT_ID,
      performedBy: "system",
    };

    await t.action(internal.magazyn.movements.consumeForAppointment, args);
    await t.action(internal.magazyn.movements.consumeForAppointment, args);

    // Only one deduction despite two calls.
    const level = await getStockLevel();
    expect(Number(level?.quantity)).toBe(8);

    const uses = await getMovements("appointment_use");
    expect(uses).toHaveLength(1);
  });

  test("idempotency resets after a stock return (complete → revert → complete cycle)", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      quantity: 10,
      updatedAt: Date.now(),
    });

    const consumeArgs = {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      locationId: null,
      totalNeeded: 2,
      appointmentId: APPOINTMENT_ID,
      performedBy: "system",
    };
    const returnArgs = {
      organizationId: String(organizationId),
      appointmentId: APPOINTMENT_ID,
      performedBy: "system",
    };

    // First completion.
    await t.action(internal.magazyn.movements.consumeForAppointment, consumeArgs);
    expect(Number((await getStockLevel())?.quantity)).toBe(8);

    // Revert.
    await t.action(internal.magazyn.movements.returnStockForAppointment, returnArgs);
    expect(Number((await getStockLevel())?.quantity)).toBe(10);

    // Second completion: guard sees countUse === countReturn so it fires again.
    await t.action(internal.magazyn.movements.consumeForAppointment, consumeArgs);
    expect(Number((await getStockLevel())?.quantity)).toBe(8);
  });
});

describe("returnStockForAppointment — completed → revert → stock return (#5630)", () => {
  test("restores stock by inverting prior appointment_use movements", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      quantity: 10,
      updatedAt: Date.now(),
    });

    // Simulate a completed appointment that already deducted stock.
    await t.action(internal.magazyn.movements.consumeForAppointment, {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      locationId: null,
      totalNeeded: 4,
      appointmentId: APPOINTMENT_ID,
      performedBy: "system",
    });
    expect(Number((await getStockLevel())?.quantity)).toBe(6);

    await t.action(internal.magazyn.movements.returnStockForAppointment, {
      organizationId: String(organizationId),
      appointmentId: APPOINTMENT_ID,
      performedBy: "system",
    });

    expect(Number((await getStockLevel())?.quantity)).toBe(10);

    const returns = await getMovements("appointment_return");
    expect(returns).toHaveLength(1);
    expect(Number(returns[0].delta)).toBe(4);
    expect(returns[0].sourceType).toBe("appointment");
    expect(returns[0].sourceId).toBe(APPOINTMENT_ID);
  });

  test("cancelled (no prior deduction) → no stock change and no error", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      quantity: 5,
      updatedAt: Date.now(),
    });

    // Call returnStockForAppointment on an appointment that was never completed.
    await t.action(internal.magazyn.movements.returnStockForAppointment, {
      organizationId: String(organizationId),
      appointmentId: APPOINTMENT_ID,
      performedBy: "system",
    });

    // Stock must remain unchanged.
    expect(Number((await getStockLevel())?.quantity)).toBe(5);

    const returns = await getMovements("appointment_return");
    expect(returns).toHaveLength(0);
  });
});

describe("returnStockForAppointment — idempotency guard (#5630)", () => {
  test("double-fire does not return stock a second time", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    const db = createSupabaseDb();
    await db.insert("productStockLevels", {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      quantity: 10,
      updatedAt: Date.now(),
    });

    await t.action(internal.magazyn.movements.consumeForAppointment, {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      locationId: null,
      totalNeeded: 3,
      appointmentId: APPOINTMENT_ID,
      performedBy: "system",
    });

    const returnArgs = {
      organizationId: String(organizationId),
      appointmentId: APPOINTMENT_ID,
      performedBy: "system",
    };
    await t.action(internal.magazyn.movements.returnStockForAppointment, returnArgs);
    await t.action(internal.magazyn.movements.returnStockForAppointment, returnArgs);

    // Stock should be 10 (original), not 13 (over-returned).
    expect(Number((await getStockLevel())?.quantity)).toBe(10);

    const returns = await getMovements("appointment_return");
    expect(returns).toHaveLength(1);
  });
});

describe("consumeForAppointment — FEFO lot granularity (#5630)", () => {
  test("lot metadata preserved in appointment_use movement", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    // Seed a lot via warehouse receipt.
    await applyMovementInternal({
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      locationId: null,
      delta: 10,
      reason: "warehouse_receive",
      lotNumber: "LOT-X",
      expiryDate: "2027-06-30",
      performedBy: "system",
    });

    await t.action(internal.magazyn.movements.consumeForAppointment, {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      locationId: null,
      totalNeeded: 2,
      appointmentId: APPOINTMENT_ID,
      treatmentId: TREATMENT_ID,
      performedBy: "system",
    });

    const uses = await getMovements("appointment_use");
    expect(uses).toHaveLength(1);
    expect(uses[0].lotNumber).toBe("LOT-X");
    expect(uses[0].expiryDate).toBe("2027-06-30");
    expect(Number(uses[0].delta)).toBe(-2);
  });

  test("returnStockForAppointment restores lot-tracked stock with correct lot metadata", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    await seedTrackedProduct(String(organizationId));

    await applyMovementInternal({
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      locationId: null,
      delta: 10,
      reason: "warehouse_receive",
      lotNumber: "LOT-Y",
      expiryDate: "2027-12-01",
      performedBy: "system",
    });

    await t.action(internal.magazyn.movements.consumeForAppointment, {
      organizationId: String(organizationId),
      productId: PRODUCT_ID,
      locationId: null,
      totalNeeded: 3,
      appointmentId: APPOINTMENT_ID,
      performedBy: "system",
    });

    await t.action(internal.magazyn.movements.returnStockForAppointment, {
      organizationId: String(organizationId),
      appointmentId: APPOINTMENT_ID,
      performedBy: "system",
    });

    const returns = await getMovements("appointment_return");
    expect(returns).toHaveLength(1);
    expect(returns[0].lotNumber).toBe("LOT-Y");
    expect(returns[0].expiryDate).toBe("2027-12-01");
    expect(Number(returns[0].delta)).toBe(3);

    // Net balance must be back to 10.
    expect(Number((await getStockLevel())?.quantity)).toBe(10);
  });
});
