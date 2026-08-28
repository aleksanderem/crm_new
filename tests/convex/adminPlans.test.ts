/**
 * SP4 Task 1 — Backend tests for plans list + update actions.
 *
 * Plans are Convex-only (not in Supabase TABLE_MAP) so reads/writes go through
 * ctx.db. The actions guard with verifyPlatformAdmin (which reads Supabase),
 * then delegate to internal query/mutation on ctx.db.
 */
import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";
import type { Id } from "../../convex/_generated/dataModel";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makePlatformAdmin(userId: string) {
  await createSupabaseDb().insert("users", {
    _id: userId,
    name: "Admin",
    email: `admin-${userId}@example.com`,
    isPlatformAdmin: true,
  });
}

const validPrices = {
  month: {
    usd: { stripeId: "p_usd_m", amount: 2900 },
    eur: { stripeId: "p_eur_m", amount: 2900 },
    pln: { stripeId: "p_pln_m", amount: 11900 },
  },
  year: {
    usd: { stripeId: "p_usd_y", amount: 29000 },
    eur: { stripeId: "p_eur_y", amount: 29000 },
    pln: { stripeId: "p_pln_y", amount: 119000 },
  },
};

async function seedPlan(
  t: ReturnType<typeof createTestCtx>,
): Promise<Id<"plans">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("plans", {
      key: "pro",
      productKey: "crm",
      stripeId: "prod_x",
      name: "Pro Plan",
      description: "The pro plan",
      seatLimit: 25,
      prices: validPrices,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("admin/plans.listPlans", () => {
  test("(a) rejects non-platform-admin callers", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);
    await createSupabaseDb().insert("users", {
      _id: String(userId),
      name: "Nobody",
      email: "nobody@example.com",
      isPlatformAdmin: false,
    });
    await expect(
      t.withIdentity(identity).action(api.admin.plans.listPlans, {}),
    ).rejects.toThrow(/platform admin/i);
  });

  test("(b) admin listPlans returns seeded plan with seatLimit 25", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));
    await seedPlan(t);

    const plans = await t
      .withIdentity(identity)
      .action(api.admin.plans.listPlans, {});

    expect(plans.length).toBeGreaterThanOrEqual(1);
    const plan = plans.find((p) => p.key === "pro");
    expect(plan).toBeTruthy();
    expect(plan?.seatLimit).toBe(25);
    expect(plan?.name).toBe("Pro Plan");
  });
});

describe("admin/plans.updatePlan", () => {
  test("(c) updatePlan patches seatLimit and name, prices UNCHANGED", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));
    const planId = await seedPlan(t);

    await t
      .withIdentity(identity)
      .action(api.admin.plans.updatePlan, {
        planId,
        seatLimit: 40,
        name: "X",
      });

    const plans = await t
      .withIdentity(identity)
      .action(api.admin.plans.listPlans, {});

    const plan = plans.find((p) => p._id === String(planId));
    expect(plan?.seatLimit).toBe(40);
    expect(plan?.name).toBe("X");
    // prices must remain unchanged
    expect(plan?.prices).toEqual(validPrices);
  });

  test("(d) updatePlan rejects seatLimit 0 (must be positive integer)", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));
    const planId = await seedPlan(t);

    await expect(
      t
        .withIdentity(identity)
        .action(api.admin.plans.updatePlan, {
          planId,
          seatLimit: 0,
        }),
    ).rejects.toThrow(/seat/i);
  });

  test("(e) seatLimit-only update leaves prices intact", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));
    const planId = await seedPlan(t);

    await t
      .withIdentity(identity)
      .action(api.admin.plans.updatePlan, {
        planId,
        seatLimit: 50,
      });

    const plans = await t
      .withIdentity(identity)
      .action(api.admin.plans.listPlans, {});

    const plan = plans.find((p) => p._id === String(planId));
    expect(plan?.seatLimit).toBe(50);
    expect(plan?.prices).toEqual(validPrices);
  });
});
