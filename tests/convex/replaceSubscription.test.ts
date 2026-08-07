import { afterEach, describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";

afterEach(async () => {
  // Drain any pending scheduler callbacks (Supabase dual-writes) before the
  // next test creates a fresh convex-test instance.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("PREAUTH_replaceSubscription", () => {
  function makePlanBase() {
    return {
      key: "pro" as const,
      name: "Pro",
      description: "Pro plan",
      seatLimit: 10,
      prices: {
        month: {
          usd: { stripeId: "price_m_usd", amount: 2900 },
          eur: { stripeId: "price_m_eur", amount: 2900 },
          pln: { stripeId: "price_m_pln", amount: 12900 },
        },
        year: {
          usd: { stripeId: "price_y_usd", amount: 29000 },
          eur: { stripeId: "price_y_eur", amount: 29000 },
          pln: { stripeId: "price_y_pln", amount: 129000 },
        },
      },
    };
  }

  test("replaces only the matching-productKey subscription when two module subscriptions exist", async () => {
    const t = createTestCtx();
    const { userId } = await seedTestUser(t);

    // Seed two module plans: CRM and Gabinet
    const { crmPlanId, gabinetPlanId, crmSubId, gabinetSubId } =
      await t.run(async (ctx) => {
        const crmPlanId = await ctx.db.insert("plans", {
          ...makePlanBase(),
          stripeId: "prod_crm_pro",
          productKey: "crm",
        });
        const gabinetPlanId = await ctx.db.insert("plans", {
          ...makePlanBase(),
          stripeId: "prod_gabinet_pro",
          productKey: "gabinet",
        });

        const now = Date.now();
        const periodEnd = now + 30 * 24 * 60 * 60 * 1000;

        const crmSubId = await ctx.db.insert("subscriptions", {
          userId,
          planId: crmPlanId,
          productKey: "crm",
          stripeId: "sub_crm_old",
          priceStripeId: "price_m_usd",
          currency: "usd",
          interval: "month",
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        });

        const gabinetSubId = await ctx.db.insert("subscriptions", {
          userId,
          planId: gabinetPlanId,
          productKey: "gabinet",
          stripeId: "sub_gabinet_active",
          priceStripeId: "price_m_usd",
          currency: "usd",
          interval: "month",
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        });

        return { crmPlanId, gabinetPlanId, crmSubId, gabinetSubId };
      });

    // Seed the upgraded CRM plan that PREAUTH_replaceSubscription will look up by stripeId
    const upgradedCrmStripeId = "prod_crm_pro_v2";
    await t.run(async (ctx) => {
      await ctx.db.insert("plans", {
        ...makePlanBase(),
        stripeId: upgradedCrmStripeId,
        productKey: "crm",
      });
    });

    const now = Date.now();
    await t.mutation(internal.stripe.PREAUTH_replaceSubscription, {
      userId,
      subscriptionStripeId: "sub_crm_new",
      input: {
        planStripeId: upgradedCrmStripeId,
        priceStripeId: "price_m_usd",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      },
    });

    const allSubs = await t.run(async (ctx) =>
      ctx.db
        .query("subscriptions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect(),
    );

    // Still exactly two subscriptions total
    expect(allSubs).toHaveLength(2);

    // Old CRM subscription deleted; new one in place
    const crmSub = allSubs.find((s) => s.stripeId === "sub_crm_new");
    expect(crmSub).toBeTruthy();
    expect(crmSub!.status).toBe("active");

    const oldCrmGone = allSubs.some((s) => s.stripeId === "sub_crm_old");
    expect(oldCrmGone).toBe(false);

    // Gabinet subscription untouched
    const gabinetSub = allSubs.find((s) => s.stripeId === "sub_gabinet_active");
    expect(gabinetSub).toBeTruthy();
    expect(gabinetSub!._id).toBe(gabinetSubId);
  });

  test("inserts a new subscription when no matching-productKey subscription exists", async () => {
    const t = createTestCtx();
    const { userId } = await seedTestUser(t);

    // Only a Gabinet subscription exists; we're adding a CRM one
    await t.run(async (ctx) => {
      const gabinetPlanId = await ctx.db.insert("plans", {
        ...makePlanBase(),
        stripeId: "prod_gabinet_pro",
        productKey: "gabinet",
      });
      const now = Date.now();
      await ctx.db.insert("subscriptions", {
        userId,
        planId: gabinetPlanId,
        productKey: "gabinet",
        stripeId: "sub_gabinet_active",
        priceStripeId: "price_m_usd",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      });
    });

    const crmPlanStripeId = "prod_crm_pro";
    await t.run(async (ctx) => {
      await ctx.db.insert("plans", {
        ...makePlanBase(),
        stripeId: crmPlanStripeId,
        productKey: "crm",
      });
    });

    const now = Date.now();
    await t.mutation(internal.stripe.PREAUTH_replaceSubscription, {
      userId,
      subscriptionStripeId: "sub_crm_new",
      input: {
        planStripeId: crmPlanStripeId,
        priceStripeId: "price_m_usd",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      },
    });

    const allSubs = await t.run(async (ctx) =>
      ctx.db
        .query("subscriptions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect(),
    );

    // Two subscriptions: the existing Gabinet one plus the new CRM one
    expect(allSubs).toHaveLength(2);
    expect(allSubs.some((s) => s.stripeId === "sub_gabinet_active")).toBe(true);
    expect(allSubs.some((s) => s.stripeId === "sub_crm_new")).toBe(true);
  });

  test("throws when the plan stripeId does not exist", async () => {
    const t = createTestCtx();
    const { userId } = await seedTestUser(t);

    const now = Date.now();
    await expect(
      t.mutation(internal.stripe.PREAUTH_replaceSubscription, {
        userId,
        subscriptionStripeId: "sub_new",
        input: {
          planStripeId: "prod_nonexistent",
          priceStripeId: "price_m_usd",
          currency: "usd",
          interval: "month",
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
          cancelAtPeriodEnd: false,
        },
      }),
    ).rejects.toThrow();
  });

  test("falls back to replacing first subscription when plan has no productKey", async () => {
    const t = createTestCtx();
    const { userId } = await seedTestUser(t);

    await t.run(async (ctx) => {
      const legacyPlanId = await ctx.db.insert("plans", {
        ...makePlanBase(),
        key: "free" as const,
        stripeId: "prod_free_legacy",
        // no productKey — platform-wide plan
      });
      const now = Date.now();
      await ctx.db.insert("subscriptions", {
        userId,
        planId: legacyPlanId,
        // no productKey — legacy plan, fallback to first-sub replacement
        stripeId: "sub_free_old",
        priceStripeId: "price_m_usd",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      });
    });

    const newPlanStripeId = "prod_free_v2";
    await t.run(async (ctx) => {
      await ctx.db.insert("plans", {
        ...makePlanBase(),
        key: "free" as const,
        stripeId: newPlanStripeId,
        // no productKey
      });
    });

    const now = Date.now();
    await t.mutation(internal.stripe.PREAUTH_replaceSubscription, {
      userId,
      subscriptionStripeId: "sub_new",
      input: {
        planStripeId: newPlanStripeId,
        priceStripeId: "price_m_usd",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      },
    });

    const allSubs = await t.run(async (ctx) =>
      ctx.db
        .query("subscriptions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect(),
    );

    // Old free subscription replaced by new one
    expect(allSubs).toHaveLength(1);
    expect(allSubs[0].stripeId).toBe("sub_new");
  });
});
