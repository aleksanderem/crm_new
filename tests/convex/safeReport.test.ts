/**
 * R2D (issue #5588): Controlled scenario and multi-day tests for the
 * Kasa + Sejf reporting area.
 *
 * Coverage:
 *   1. Controlled scenario — full day flow: opening 200, cash payments +300,
 *      manual expenses −120, counted 380, split 180 (Kasa) + 200 (Sejf).
 *      Verifies: correct cashFromPayments, cashExpected, discrepancy, safe
 *      movement, and that the 200 transfer does NOT appear in revenue.
 *   2. Multi-day accumulation — Day 1 +200, Day 2 +300 → safe balance 500.
 *      Withdrawal of 150 → balance 350.  Correct per-day history.
 *   3. Overdraft rejection — withdrawal > current safe balance is rejected.
 *   4. No double transfer — idempotent retry of a day-close does NOT create
 *      a second safe movement (complements dayClose.test.ts test 5).
 *   5. Withdrawal is visible in movement history (audit trail).
 *   6. Historical day close with NULL split fields — no safe movement created.
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function seedGabinetSubscription(
  t: ReturnType<typeof createTestCtx>,
  organizationId: string,
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

// Returns a UTC timestamp that falls at local midday on the given YYYY-MM-DD
// date interpreted in Europe/Warsaw (CEST = UTC+2 in August).
function warsawMiddayTs(dateStr: string): number {
  // Midday Warsaw in August (CEST = UTC+2) = 10:00 UTC
  return new Date(`${dateStr}T10:00:00.000Z`).getTime();
}

// Seed a completed cash payment for the given org/date. No appointmentId so it
// is captured by createDayClose even when a locationId is provided (the action
// falls back to "appointment_id IS NULL" when no appointments exist for the day).
async function seedCashPayment(
  organizationId: string,
  amount: number,
  dateStr: string,
): Promise<string> {
  const db = createSupabaseDb();
  return db.insert("payments", {
    organizationId,
    amount,
    currency: "PLN",
    paymentMethod: "cash",
    status: "completed",
    paidAt: warsawMiddayTs(dateStr),
    appointmentId: null,
    patientId: null,
    packageUsageId: null,
    notes: null,
    discountAmount: null,
    discountPercent: null,
    creditEarned: null,
    creditApplied: null,
    createdAt: warsawMiddayTs(dateStr),
    updatedAt: warsawMiddayTs(dateStr),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("R2D — Kasa + Sejf report scenarios", () => {
  // ── Test 1: Controlled scenario ──────────────────────────────────────────
  test("1. controlled scenario: opening 200, cash payments 300, expenses 120, split 180+200", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));
    const locationId = "loc-r2d-001";
    await seedLocation(locationId, String(organizationId));

    const DATE = "2026-08-19";

    // Seed a 300 PLN cash payment from a client.
    await seedCashPayment(String(organizationId), 300, DATE);

    // Seed two manual expenses via cash transactions.
    await t.withIdentity(identity).action(api.gabinet.dayClose.createCashTransaction, {
      organizationId: String(organizationId),
      locationId,
      date: DATE,
      type: "withdrawal",
      amount: 100,
      reason: "Kurier",
    });
    await t.withIdentity(identity).action(api.gabinet.dayClose.createCashTransaction, {
      organizationId: String(organizationId),
      locationId,
      date: DATE,
      type: "withdrawal",
      amount: 20,
      reason: "Mleko",
    });

    // Close the day: opening=200, counted=380, split 180 (Kasa) + 200 (Sejf).
    // cashExpected = opening(200) + cashFromPayments(300) + deposits(0) - withdrawals(120) = 380
    const result = await t.withIdentity(identity).action(
      api.gabinet.dayClose.createDayClose,
      {
        organizationId: String(organizationId),
        locationId,
        date: DATE,
        cashOpeningBalance: 200,
        cashCounted: 380,
        cashNextOpening: 180,
        cashToSafe: 200,
      },
    );

    expect(result.id).toBeTruthy();

    const db = createSupabaseDb();
    const stored = await db.get<Record<string, unknown>>("gabinetDayCloses", result.id);
    expect(stored).not.toBeNull();

    // Cash from payments must reflect only actual payment records (no manual ops).
    expect(Number(stored!.cashFromPayments)).toBe(300);
    // Manual deposits (there are none in this scenario).
    expect(Number(stored!.cashDeposits)).toBe(0);
    // Manual withdrawals (Kurier + Mleko).
    expect(Number(stored!.cashWithdrawals)).toBe(120);
    // Expected = opening + cashFromPayments + deposits - withdrawals = 380.
    expect(Number(stored!.cashExpected)).toBe(380);
    // Counted matches expected → no discrepancy.
    expect(Number(stored!.cashCounted)).toBe(380);
    expect(Number(stored!.cashDiscrepancy)).toBe(0);
    // Cash split fields.
    expect(Number(stored!.cashNextOpening)).toBe(180);
    expect(Number(stored!.cashToSafe)).toBe(200);

    // Exactly one transfer_in movement in the safe for 200.
    const movements = await db.query("gabinetSafeMovements")
      .eq("organizationId", String(organizationId))
      .collect();
    expect(movements).toHaveLength(1);
    const mov = movements[0] as Record<string, unknown>;
    expect(mov.type).toBe("transfer_in");
    expect(Number(mov.amount)).toBe(200);
    expect(mov.locationId).toBe(locationId);
    // Transfer is linked to the day close for traceability.
    expect(mov.referenceDayCloseId).toBe(result.id);

    // Verify: cashFromPayments (300) and transfer to safe (200) do NOT overlap.
    // The total revenue is still 300 — the safe transfer is a neutral cash flow.
    const safeBalance = await db.query<Record<string, unknown>>("gabinetSafeMovements")
      .eq("organizationId", String(organizationId))
      .collect();
    const totalIn = safeBalance
      .filter((m) => m.type === "transfer_in")
      .reduce((s, m) => s + Number(m.amount), 0);
    const totalOut = safeBalance
      .filter((m) => m.type === "withdrawal")
      .reduce((s, m) => s + Number(m.amount), 0);
    expect(totalIn).toBe(200); // safe balance = 200, NOT 200 + 300
    expect(totalOut).toBe(0);
  });

  // ── Test 2: Multi-day accumulation ───────────────────────────────────────
  test("2. multi-day: Day1 +200 to safe, Day2 +300 to safe → balance 500, then withdrawal 150 → balance 350", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));
    const locationId = "loc-r2d-002";
    await seedLocation(locationId, String(organizationId));

    // Day 1: close with cashToSafe = 200.
    await t.withIdentity(identity).action(api.gabinet.dayClose.createDayClose, {
      organizationId: String(organizationId),
      locationId,
      date: "2026-08-17",
      cashOpeningBalance: 0,
      cashCounted: 200,
      cashNextOpening: 0,
      cashToSafe: 200,
    });

    // Day 2: close with cashToSafe = 300.
    await t.withIdentity(identity).action(api.gabinet.dayClose.createDayClose, {
      organizationId: String(organizationId),
      locationId,
      date: "2026-08-18",
      cashOpeningBalance: 0,
      cashCounted: 300,
      cashNextOpening: 0,
      cashToSafe: 300,
    });

    const db = createSupabaseDb();

    // Safe balance = 500 after two days.
    const allMovements = await db.query<Record<string, unknown>>("gabinetSafeMovements")
      .eq("organizationId", String(organizationId))
      .eq("locationId", locationId)
      .collect();
    expect(allMovements).toHaveLength(2);
    const balanceBefore = allMovements
      .reduce((s, m) => m.type === "transfer_in" ? s + Number(m.amount) : s - Number(m.amount), 0);
    expect(balanceBefore).toBe(500);

    // Withdrawal of 150 from the safe.
    await t.withIdentity(identity).action(api.gabinet.safe.withdrawFromSafe, {
      organizationId: String(organizationId),
      locationId,
      amount: 150,
      description: "Opłata bieżąca",
    });

    // Safe balance after withdrawal = 350.
    const afterMovements = await db.query<Record<string, unknown>>("gabinetSafeMovements")
      .eq("organizationId", String(organizationId))
      .eq("locationId", locationId)
      .collect();
    expect(afterMovements).toHaveLength(3);

    const balanceAfter = afterMovements
      .reduce((s, m) => m.type === "transfer_in" ? s + Number(m.amount) : s - Number(m.amount), 0);
    expect(balanceAfter).toBe(350);

    // Two days of history are visible.
    const dayCloses = await db.query<Record<string, unknown>>("gabinetDayCloses")
      .eq("organizationId", String(organizationId))
      .eq("locationId", locationId)
      .collect();
    expect(dayCloses).toHaveLength(2);
    const dates = dayCloses.map((dc) => dc.date as string).sort();
    expect(dates).toEqual(["2026-08-17", "2026-08-18"]);
    const toSafeTotals = dayCloses.reduce((s, dc) => s + Number(dc.cashToSafe ?? 0), 0);
    expect(toSafeTotals).toBe(500);
  });

  // ── Test 3: Overdraft rejection ───────────────────────────────────────────
  test("3. overdraft: withdrawal larger than safe balance is rejected", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));
    const locationId = "loc-r2d-003";
    await seedLocation(locationId, String(organizationId));

    // Put 300 in the safe.
    await t.withIdentity(identity).action(api.gabinet.dayClose.createDayClose, {
      organizationId: String(organizationId),
      locationId,
      date: "2026-08-19",
      cashOpeningBalance: 0,
      cashCounted: 300,
      cashNextOpening: 0,
      cashToSafe: 300,
    });

    // Attempt to withdraw 500 (more than the 300 balance).
    await expect(
      t.withIdentity(identity).action(api.gabinet.safe.withdrawFromSafe, {
        organizationId: String(organizationId),
        locationId,
        amount: 500,
        description: "Too large",
      }),
    ).rejects.toThrow(/Insufficient safe balance/);

    // Safe balance remains 300 after the failed withdrawal.
    const db = createSupabaseDb();
    const movements = await db.query<Record<string, unknown>>("gabinetSafeMovements")
      .eq("organizationId", String(organizationId))
      .eq("locationId", locationId)
      .collect();
    const balance = movements.reduce(
      (s, m) => m.type === "transfer_in" ? s + Number(m.amount) : s - Number(m.amount),
      0,
    );
    expect(balance).toBe(300);
  });

  // ── Test 4: No double safe transfer on day-close retry ────────────────────
  test("4. retry of day close does not create a second safe movement", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));
    const locationId = "loc-r2d-004";
    await seedLocation(locationId, String(organizationId));

    // First close succeeds.
    await t.withIdentity(identity).action(api.gabinet.dayClose.createDayClose, {
      organizationId: String(organizationId),
      locationId,
      date: "2026-08-19",
      cashOpeningBalance: 0,
      cashCounted: 400,
      cashNextOpening: 0,
      cashToSafe: 400,
    });

    // Retry should throw "Day already closed" but NOT create a second movement.
    await expect(
      t.withIdentity(identity).action(api.gabinet.dayClose.createDayClose, {
        organizationId: String(organizationId),
        locationId,
        date: "2026-08-19",
        cashOpeningBalance: 0,
        cashCounted: 400,
        cashNextOpening: 0,
        cashToSafe: 400,
      }),
    ).rejects.toThrow(/Day already closed/);

    const db = createSupabaseDb();
    const movements = await db.query<Record<string, unknown>>("gabinetSafeMovements")
      .eq("organizationId", String(organizationId))
      .collect();
    expect(movements).toHaveLength(1); // still exactly one
  });

  // ── Test 5: Withdrawal visible in movement history ────────────────────────
  test("5. withdrawal is recorded in movement history with description (audit trail)", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));
    const locationId = "loc-r2d-005";
    await seedLocation(locationId, String(organizationId));

    // Fund the safe.
    await t.withIdentity(identity).action(api.gabinet.dayClose.createDayClose, {
      organizationId: String(organizationId),
      locationId,
      date: "2026-08-19",
      cashOpeningBalance: 0,
      cashCounted: 500,
      cashNextOpening: 0,
      cashToSafe: 500,
    });

    // Withdraw with a description.
    await t.withIdentity(identity).action(api.gabinet.safe.withdrawFromSafe, {
      organizationId: String(organizationId),
      locationId,
      amount: 50,
      description: "Wypłata operacyjna",
    });

    const db = createSupabaseDb();
    const movements = await db.query<Record<string, unknown>>("gabinetSafeMovements")
      .eq("organizationId", String(organizationId))
      .eq("locationId", locationId)
      .collect();

    const withdrawal = movements.find((m) => m.type === "withdrawal");
    expect(withdrawal).toBeTruthy();
    expect(Number(withdrawal!.amount)).toBe(50);
    expect(withdrawal!.description).toBe("Wypłata operacyjna");
    expect(withdrawal!.createdBy).toBeTruthy(); // audit: who did it

    // Safe balance = 500 − 50 = 450.
    const balance = movements.reduce(
      (s, m) => m.type === "transfer_in" ? s + Number(m.amount) : s - Number(m.amount),
      0,
    );
    expect(balance).toBe(450);
  });

  // ── Test 6: Historical day close has NULL split fields ────────────────────
  test("6. historical day close without split args stores NULL — no safe movement", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedGabinetSubscription(t, String(organizationId));

    const result = await t.withIdentity(identity).action(
      api.gabinet.dayClose.createDayClose,
      {
        organizationId: String(organizationId),
        date: "2026-08-19",
        cashOpeningBalance: 0,
        cashCounted: 200,
        // cashNextOpening and cashToSafe intentionally omitted
      },
    );

    const db = createSupabaseDb();
    const stored = await db.get<Record<string, unknown>>("gabinetDayCloses", result.id);
    expect(stored!.cashNextOpening).toBeNull();
    expect(stored!.cashToSafe).toBeNull();

    const movements = await db.query("gabinetSafeMovements")
      .eq("organizationId", String(organizationId))
      .collect();
    expect(movements).toHaveLength(0);
  });
});
