import { expect, test, describe } from "vitest";
import { api } from "../_generated/api";
import { createTestCtx, seedTestUser, seedSecondUser } from "../_test_helpers";

describe("checkSeatLimit via getSeatUsage", () => {
  test("returns 1 seat used for org with only owner (free tier default)", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const usage = await t
      .withIdentity(identity)
      .query(api.organizations.getSeatUsage, { organizationId });

    expect(usage.currentSeats).toBe(1);
    expect(usage.seatLimit).toBe(5); // free tier default
    expect(usage.canAddMore).toBe(true);
  });

  test("counts multiple members correctly", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await seedSecondUser(t, organizationId);

    const usage = await t
      .withIdentity(identity)
      .query(api.organizations.getSeatUsage, { organizationId });

    expect(usage.currentSeats).toBe(2);
    expect(usage.canAddMore).toBe(true);
  });

  test("uses plan seatLimit from active subscription", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    // Create a plan with seatLimit of 25
    const planId = await t.run(async (ctx) => {
      return await ctx.db.insert("plans", {
        key: "pro",
        stripeId: "price_pro",
        name: "Pro",
        description: "Pro plan",
        seatLimit: 25,
        prices: {
          month: {
            usd: { stripeId: "price_pro_m_usd", amount: 2900 },
            eur: { stripeId: "price_pro_m_eur", amount: 2900 },
          },
          year: {
            usd: { stripeId: "price_pro_y_usd", amount: 29000 },
            eur: { stripeId: "price_pro_y_eur", amount: 29000 },
          },
        },
      });
    });

    // Create active subscription for the owner
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
        planId,
        priceStripeId: "price_pro_m_usd",
        stripeId: "sub_123",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: Date.now(),
        currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      });
    });

    const usage = await t
      .withIdentity(identity)
      .query(api.organizations.getSeatUsage, { organizationId });

    expect(usage.seatLimit).toBe(25);
    expect(usage.canAddMore).toBe(true);
  });

  test("uses plan seatLimit from trialing subscription", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const planId = await t.run(async (ctx) => {
      return await ctx.db.insert("plans", {
        key: "pro",
        stripeId: "price_pro",
        name: "Pro",
        description: "Pro plan",
        seatLimit: 10,
        prices: {
          month: {
            usd: { stripeId: "price_pro_m_usd", amount: 2900 },
            eur: { stripeId: "price_pro_m_eur", amount: 2900 },
          },
          year: {
            usd: { stripeId: "price_pro_y_usd", amount: 29000 },
            eur: { stripeId: "price_pro_y_eur", amount: 29000 },
          },
        },
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
        planId,
        priceStripeId: "price_pro_m_usd",
        stripeId: "sub_trial",
        currency: "usd",
        interval: "month",
        status: "trialing",
        currentPeriodStart: Date.now(),
        currentPeriodEnd: Date.now() + 14 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      });
    });

    const usage = await t
      .withIdentity(identity)
      .query(api.organizations.getSeatUsage, { organizationId });

    expect(usage.seatLimit).toBe(10);
  });

  test("canAddMore is false when at limit", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    // Create a plan with seatLimit of 2
    const planId = await t.run(async (ctx) => {
      return await ctx.db.insert("plans", {
        key: "free",
        stripeId: "price_free",
        name: "Free",
        description: "Free plan",
        seatLimit: 2,
        prices: {
          month: {
            usd: { stripeId: "price_f_m_usd", amount: 0 },
            eur: { stripeId: "price_f_m_eur", amount: 0 },
          },
          year: {
            usd: { stripeId: "price_f_y_usd", amount: 0 },
            eur: { stripeId: "price_f_y_eur", amount: 0 },
          },
        },
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId: (await ctx.db.query("users").first())!._id,
        planId,
        priceStripeId: "price_f_m_usd",
        stripeId: "sub_free",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: Date.now(),
        currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      });
    });

    // Add second member to reach limit
    await seedSecondUser(t, organizationId);

    const usage = await t
      .withIdentity(identity)
      .query(api.organizations.getSeatUsage, { organizationId });

    expect(usage.currentSeats).toBe(2);
    expect(usage.seatLimit).toBe(2);
    expect(usage.canAddMore).toBe(false);
  });

  test("seat limits are per-organization", async () => {
    const t = createTestCtx();
    const { organizationId: org1Id, identity } = await seedTestUser(t);

    // Create a second org for the same user
    const org2Id = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").first())!;
      const orgId = await ctx.db.insert("organizations", {
        name: "Second Org",
        slug: "second-org",
        ownerId: user._id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("teamMemberships", {
        organizationId: orgId,
        userId: user._id,
        role: "owner",
        joinedAt: Date.now(),
      });
      return orgId;
    });

    // Add members to org1
    await seedSecondUser(t, org1Id);

    const usage1 = await t
      .withIdentity(identity)
      .query(api.organizations.getSeatUsage, { organizationId: org1Id });
    const usage2 = await t
      .withIdentity(identity)
      .query(api.organizations.getSeatUsage, { organizationId: org2Id });

    expect(usage1.currentSeats).toBe(2);
    expect(usage2.currentSeats).toBe(1);
  });
});

describe("invitations.create with seat limit", () => {
  test("succeeds when under limit", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const invitationId = await t.withIdentity(identity).mutation(
      api.invitations.create,
      {
        organizationId,
        email: "new@example.com",
        role: "member",
      }
    );

    expect(invitationId).toBeTruthy();
  });

  test("fails when at seat limit", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    // Create plan with seatLimit of 1
    const planId = await t.run(async (ctx) => {
      return await ctx.db.insert("plans", {
        key: "free",
        stripeId: "price_free",
        name: "Free",
        description: "Free plan",
        seatLimit: 1,
        prices: {
          month: {
            usd: { stripeId: "price_f_m_usd", amount: 0 },
            eur: { stripeId: "price_f_m_eur", amount: 0 },
          },
          year: {
            usd: { stripeId: "price_f_y_usd", amount: 0 },
            eur: { stripeId: "price_f_y_eur", amount: 0 },
          },
        },
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
        planId,
        priceStripeId: "price_f_m_usd",
        stripeId: "sub_1",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: Date.now(),
        currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      });
    });

    // Owner already counts as 1 seat, limit is 1
    await expect(
      t.withIdentity(identity).mutation(api.invitations.create, {
        organizationId,
        email: "new@example.com",
        role: "member",
      })
    ).rejects.toThrow("Seat limit reached (1/1)");
  });

  test("error message includes seat counts", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const planId = await t.run(async (ctx) => {
      return await ctx.db.insert("plans", {
        key: "free",
        stripeId: "price_free",
        name: "Free",
        description: "Free plan",
        seatLimit: 1,
        prices: {
          month: {
            usd: { stripeId: "price_f_m_usd", amount: 0 },
            eur: { stripeId: "price_f_m_eur", amount: 0 },
          },
          year: {
            usd: { stripeId: "price_f_y_usd", amount: 0 },
            eur: { stripeId: "price_f_y_eur", amount: 0 },
          },
        },
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
        planId,
        priceStripeId: "price_f_m_usd",
        stripeId: "sub_err",
        currency: "usd",
        interval: "month",
        status: "active",
        currentPeriodStart: Date.now(),
        currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      });
    });

    await expect(
      t.withIdentity(identity).mutation(api.invitations.create, {
        organizationId,
        email: "new@example.com",
        role: "member",
      })
    ).rejects.toThrow("Upgrade your plan to add more team members");
  });
});

describe("member removal frees seat", () => {
  test("removing a member decreases seat count", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const { userId: secondUserId } = await seedSecondUser(t, organizationId);

    // Verify 2 seats used
    let usage = await t
      .withIdentity(identity)
      .query(api.organizations.getSeatUsage, { organizationId });
    expect(usage.currentSeats).toBe(2);

    // Find the second user's membership and remove it
    const membershipId = await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("teamMemberships")
        .withIndex("by_orgAndUser", (q) =>
          q.eq("organizationId", organizationId).eq("userId", secondUserId)
        )
        .unique();
      return membership!._id;
    });

    await t.withIdentity(identity).mutation(api.organizations.removeMember, {
      organizationId,
      membershipId,
    });

    // Verify seat freed
    usage = await t
      .withIdentity(identity)
      .query(api.organizations.getSeatUsage, { organizationId });
    expect(usage.currentSeats).toBe(1);
    expect(usage.canAddMore).toBe(true);
  });
});
