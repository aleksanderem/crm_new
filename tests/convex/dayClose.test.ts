/**
 * Tests for R2B (issue #5575): day-close cash split — cashNextOpening +
 * cashToSafe, with automatic safe movement creation.
 *
 * Coverage:
 *   1. Correct cash split persists both fields on the day close record.
 *   2. Invalid sum (cashNextOpening + cashToSafe ≠ cashCounted) is rejected.
 *   3. cashToSafe = 0 — no safe movement is created.
 *   4. Positive cashToSafe — exactly one transfer_in movement is created.
 *   5. Idempotency — retry does not create a second safe movement.
 *   6. Negative values are rejected.
 *   7. cashToSafe exceeding cashCounted is rejected.
 *   8. locationId required when cashToSafe > 0.
 *   9. Historical close (no split args) stores NULL for both fields.
 *  10. cashNextOpening value is available for the next day (query asserts it).
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedGabinetSubscription(
  t: ReturnType<typeof createTestCtx>,
  organizationId: Parameters<typeof createTestCtx>[0] extends undefined
    ? string
    : string,
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("productSubscriptions", {
      organizationId: organizationId as any,
      productId: "gabinet",
      status: "active",
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    });
  });
}

function seedLocation(locationId: string, organizationId: string) {
  const db = createSupabaseDb();
  return db.insert("gabinetLocations", {
    id: locationId,
    organizationId,
    name: "Test Location",
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

const DATE = "2026-08-19";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dayClose — R2B cash split", () => {
  test("1. correct split persists cashNextOpening and cashToSafe on the day close", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));
    const locationId = "loc-001";
    await seedLocation(locationId, String(organizationId));

    const result = await t.withIdentity(identity).action(
      api.gabinet.dayClose.createDayClose,
      {
        organizationId: String(organizationId),
        locationId,
        date: DATE,
        cashOpeningBalance: 0,
        cashCounted: 1000,
        cashNextOpening: 200,
        cashToSafe: 800,
      },
    );

    expect(result.id).toBeTruthy();

    // Verify the day close record has the split fields.
    const db = createSupabaseDb();
    const stored = await db.get<Record<string, unknown>>(
      "gabinetDayCloses",
      result.id,
    );
    expect(stored).not.toBeNull();
    expect(Number(stored!.cashNextOpening)).toBe(200);
    expect(Number(stored!.cashToSafe)).toBe(800);
  });

  test("2. invalid sum (nextOpening + toSafe ≠ counted) is rejected", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));
    const locationId = "loc-002";
    await seedLocation(locationId, String(organizationId));

    await expect(
      t.withIdentity(identity).action(api.gabinet.dayClose.createDayClose, {
        organizationId: String(organizationId),
        locationId,
        date: DATE,
        cashOpeningBalance: 0,
        cashCounted: 1000,
        cashNextOpening: 300,
        cashToSafe: 800, // 300 + 800 = 1100 ≠ 1000
      }),
    ).rejects.toThrow(/must equal cashCounted/);
  });

  test("3. cashToSafe = 0 creates no safe movement", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));
    const locationId = "loc-003";
    await seedLocation(locationId, String(organizationId));

    const result = await t.withIdentity(identity).action(
      api.gabinet.dayClose.createDayClose,
      {
        organizationId: String(organizationId),
        locationId,
        date: DATE,
        cashOpeningBalance: 0,
        cashCounted: 500,
        cashNextOpening: 500,
        cashToSafe: 0,
      },
    );

    expect(result.id).toBeTruthy();

    // Verify no safe movement was created.
    const db = createSupabaseDb();
    const movements = db
      .query("gabinetSafeMovements")
      .eq("organizationId", String(organizationId));
    const rows = await movements.collect();
    expect(rows).toHaveLength(0);
  });

  test("4. positive cashToSafe creates exactly one transfer_in movement linked to the day close", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));
    const locationId = "loc-004";
    await seedLocation(locationId, String(organizationId));

    const result = await t.withIdentity(identity).action(
      api.gabinet.dayClose.createDayClose,
      {
        organizationId: String(organizationId),
        locationId,
        date: DATE,
        cashOpeningBalance: 0,
        cashCounted: 1200,
        cashNextOpening: 400,
        cashToSafe: 800,
      },
    );

    const db = createSupabaseDb();
    const movements = await db
      .query("gabinetSafeMovements")
      .eq("organizationId", String(organizationId))
      .collect();

    expect(movements).toHaveLength(1);
    const mov = movements[0] as Record<string, unknown>;
    expect(mov.type).toBe("transfer_in");
    expect(Number(mov.amount)).toBe(800);
    expect(mov.locationId).toBe(locationId);
    expect(mov.referenceDayCloseId).toBe(result.id);
  });

  test("5. idempotency — retry after interrupted transfer does not create a second safe movement", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));
    const locationId = "loc-005";
    await seedLocation(locationId, String(organizationId));

    // First call succeeds.
    const result = await t.withIdentity(identity).action(
      api.gabinet.dayClose.createDayClose,
      {
        organizationId: String(organizationId),
        locationId,
        date: DATE,
        cashOpeningBalance: 0,
        cashCounted: 600,
        cashNextOpening: 100,
        cashToSafe: 500,
      },
    );

    // Simulate retry: the action throws "Day already closed…" but should NOT
    // create a second movement (idempotency guard in the existing-close branch).
    await expect(
      t.withIdentity(identity).action(api.gabinet.dayClose.createDayClose, {
        organizationId: String(organizationId),
        locationId,
        date: DATE,
        cashOpeningBalance: 0,
        cashCounted: 600,
        cashNextOpening: 100,
        cashToSafe: 500,
      }),
    ).rejects.toThrow(/Day already closed/);

    // Still exactly one safe movement.
    const db = createSupabaseDb();
    const movements = await db
      .query("gabinetSafeMovements")
      .eq("organizationId", String(organizationId))
      .collect();

    expect(movements).toHaveLength(1);
    expect((movements[0] as Record<string, unknown>).referenceDayCloseId).toBe(
      result.id,
    );
  });

  test("6. negative values (cashNextOpening < 0) are rejected", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));

    await expect(
      t.withIdentity(identity).action(api.gabinet.dayClose.createDayClose, {
        organizationId: String(organizationId),
        date: DATE,
        cashOpeningBalance: 0,
        cashCounted: 1000,
        cashNextOpening: -100,
        cashToSafe: 1100,
      }),
    ).rejects.toThrow(/non-negative/);
  });

  test("7. cashToSafe exceeding cashCounted is rejected", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));

    await expect(
      t.withIdentity(identity).action(api.gabinet.dayClose.createDayClose, {
        organizationId: String(organizationId),
        date: DATE,
        cashOpeningBalance: 0,
        cashCounted: 500,
        cashNextOpening: 0,
        cashToSafe: 600,
      }),
    ).rejects.toThrow(/cannot exceed cashCounted/);
  });

  test("8. cashToSafe > 0 without locationId is rejected", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));

    await expect(
      t.withIdentity(identity).action(api.gabinet.dayClose.createDayClose, {
        organizationId: String(organizationId),
        // no locationId
        date: DATE,
        cashOpeningBalance: 0,
        cashCounted: 400,
        cashNextOpening: 100,
        cashToSafe: 300,
      }),
    ).rejects.toThrow(/locationId is required/);
  });

  test("9. historical close (no split args) stores NULL for cashNextOpening and cashToSafe", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));

    const result = await t.withIdentity(identity).action(
      api.gabinet.dayClose.createDayClose,
      {
        organizationId: String(organizationId),
        date: DATE,
        cashOpeningBalance: 0,
        cashCounted: 300,
        // cashNextOpening and cashToSafe intentionally omitted (historical)
      },
    );

    const db = createSupabaseDb();
    const stored = await db.get<Record<string, unknown>>(
      "gabinetDayCloses",
      result.id,
    );
    expect(stored).not.toBeNull();
    expect(stored!.cashNextOpening).toBeNull();
    expect(stored!.cashToSafe).toBeNull();
  });

  test("10. cashNextOpening is retrievable from the day close record for next-day use", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));
    const locationId = "loc-010";
    await seedLocation(locationId, String(organizationId));

    const result = await t.withIdentity(identity).action(
      api.gabinet.dayClose.createDayClose,
      {
        organizationId: String(organizationId),
        locationId,
        date: DATE,
        cashOpeningBalance: 0,
        cashCounted: 750,
        cashNextOpening: 250,
        cashToSafe: 500,
      },
    );

    // Retrieve the day close and confirm cashNextOpening is present and
    // correct — this is the value the next day's opening balance can be
    // pre-filled with.
    const db = createSupabaseDb();
    const stored = await db.get<Record<string, unknown>>(
      "gabinetDayCloses",
      result.id,
    );
    expect(stored).not.toBeNull();
    expect(Number(stored!.cashNextOpening)).toBe(250);
    expect(Number(stored!.cashToSafe)).toBe(500);

    // The safe movement amount matches cashToSafe.
    const movements = await db
      .query("gabinetSafeMovements")
      .eq("organizationId", String(organizationId))
      .collect();
    expect(movements).toHaveLength(1);
    expect(Number((movements[0] as Record<string, unknown>).amount)).toBe(500);
  });
});
