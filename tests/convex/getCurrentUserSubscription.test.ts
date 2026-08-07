import { afterEach, describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";

afterEach(async () => {
  // Drain any pending scheduler callbacks (Supabase dual-writes) before the
  // next test creates a fresh convex-test instance.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("getCurrentUserSubscription", () => {
  function makePlanBase() {
    return {
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

  test("returns Gabinet free sub when user has paid CRM + free Gabinet (multi-module guard)", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    const { gabinetTargetPlanId } = await t.run(async (ctx) => {
      const now = Date.now();
      const periodEnd = now + 30 * 24 * 60 * 60 * 1000;

      // Paid CRM plan + subscription
      const crmPlanId = await ctx.db.insert("plans", {
        ...makePlanBase(),
        key: "pro" as const,
        stripeId: "prod_crm_pro",
        productKey: "crm",
      });
      await ctx.db.insert("subscriptions", {
        userId,
        planId: crmPlanId,
        productKey: "crm",
        stripeId: "sub_crm_pro",
        priceStripeId: "price_m_usd",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      });

      // Free Gabinet plan + subscription
      const gabinetFreePlanId = await ctx.db.insert("plans", {
        ...makePlanBase(),
        key: "free" as const,
        name: "Free",
        description: "Free Gabinet plan",
        stripeId: "prod_gabinet_free",
        productKey: "gabinet",
      });
      await ctx.db.insert("subscriptions", {
        userId,
        planId: gabinetFreePlanId,
        productKey: "gabinet",
        stripeId: "sub_gabinet_free",
        priceStripeId: "price_m_usd",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      });

      // The Gabinet pro plan that the user wants to upgrade to
      const gabinetTargetPlanId = await ctx.db.insert("plans", {
        ...makePlanBase(),
        key: "pro" as const,
        stripeId: "prod_gabinet_pro",
        productKey: "gabinet",
      });

      return { gabinetTargetPlanId };
    });

    const result = await t
      .withIdentity(identity)
      .query(internal.stripe.getCurrentUserSubscription, {
        planId: gabinetTargetPlanId,
      });

    // Must return the Gabinet subscription, not the paid CRM one
    expect(result.currentSubscription.productKey).toBe("gabinet");
    expect(result.currentSubscription.stripeId).toBe("sub_gabinet_free");
    expect(result.currentSubscription.plan?.key).toBe("free");

    // The target plan should be the Gabinet pro plan
    expect(result.newPlan?._id).toBe(gabinetTargetPlanId);
    expect(result.newPlan?.productKey).toBe("gabinet");
  });

  test("returns CRM sub scoped by productKey when user has multiple module subscriptions", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    const { crmTargetPlanId } = await t.run(async (ctx) => {
      const now = Date.now();
      const periodEnd = now + 30 * 24 * 60 * 60 * 1000;

      const crmFreePlanId = await ctx.db.insert("plans", {
        ...makePlanBase(),
        key: "free" as const,
        name: "Free",
        description: "Free CRM plan",
        stripeId: "prod_crm_free",
        productKey: "crm",
      });
      await ctx.db.insert("subscriptions", {
        userId,
        planId: crmFreePlanId,
        productKey: "crm",
        stripeId: "sub_crm_free",
        priceStripeId: "price_m_usd",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      });

      const gabinetProPlanId = await ctx.db.insert("plans", {
        ...makePlanBase(),
        key: "pro" as const,
        stripeId: "prod_gabinet_pro",
        productKey: "gabinet",
      });
      await ctx.db.insert("subscriptions", {
        userId,
        planId: gabinetProPlanId,
        productKey: "gabinet",
        stripeId: "sub_gabinet_pro",
        priceStripeId: "price_m_usd",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      });

      const crmTargetPlanId = await ctx.db.insert("plans", {
        ...makePlanBase(),
        key: "pro" as const,
        stripeId: "prod_crm_pro",
        productKey: "crm",
      });

      return { crmTargetPlanId };
    });

    const result = await t
      .withIdentity(identity)
      .query(internal.stripe.getCurrentUserSubscription, {
        planId: crmTargetPlanId,
      });

    expect(result.currentSubscription.productKey).toBe("crm");
    expect(result.currentSubscription.stripeId).toBe("sub_crm_free");
    expect(result.currentSubscription.plan?.key).toBe("free");
  });

  test("falls back to first subscription by userId when target plan has no productKey", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    const { legacyTargetPlanId } = await t.run(async (ctx) => {
      const now = Date.now();
      const periodEnd = now + 30 * 24 * 60 * 60 * 1000;

      const legacyFreePlanId = await ctx.db.insert("plans", {
        ...makePlanBase(),
        key: "free" as const,
        name: "Free",
        description: "Legacy free plan",
        stripeId: "prod_free_legacy",
        // no productKey — platform-wide plan
      });
      await ctx.db.insert("subscriptions", {
        userId,
        planId: legacyFreePlanId,
        // no productKey — legacy subscription
        stripeId: "sub_free_legacy",
        priceStripeId: "price_m_usd",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      });

      const legacyTargetPlanId = await ctx.db.insert("plans", {
        ...makePlanBase(),
        key: "pro" as const,
        stripeId: "prod_pro_legacy",
        // no productKey
      });

      return { legacyTargetPlanId };
    });

    const result = await t
      .withIdentity(identity)
      .query(internal.stripe.getCurrentUserSubscription, {
        planId: legacyTargetPlanId,
      });

    expect(result.currentSubscription.stripeId).toBe("sub_free_legacy");
    expect(result.newPlan?._id).toBe(legacyTargetPlanId);
  });

  test("throws when no matching-productKey subscription exists for the user", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    const { gabinetPlanId } = await t.run(async (ctx) => {
      const now = Date.now();
      const periodEnd = now + 30 * 24 * 60 * 60 * 1000;

      // Only a CRM subscription exists
      const crmPlanId = await ctx.db.insert("plans", {
        ...makePlanBase(),
        key: "free" as const,
        name: "Free",
        description: "Free CRM plan",
        stripeId: "prod_crm_free",
        productKey: "crm",
      });
      await ctx.db.insert("subscriptions", {
        userId,
        planId: crmPlanId,
        productKey: "crm",
        stripeId: "sub_crm_free",
        priceStripeId: "price_m_usd",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      });

      const gabinetPlanId = await ctx.db.insert("plans", {
        ...makePlanBase(),
        key: "pro" as const,
        stripeId: "prod_gabinet_pro",
        productKey: "gabinet",
      });

      return { gabinetPlanId };
    });

    await expect(
      t
        .withIdentity(identity)
        .query(internal.stripe.getCurrentUserSubscription, {
          planId: gabinetPlanId,
        }),
    ).rejects.toThrow();
  });
});
