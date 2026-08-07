import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { verifyProductAccess } from "../../convex/_helpers/products";

describe("getActiveProducts", () => {
  test("returns empty array when org has no subscriptions", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const products = await t.withIdentity(identity).query(
      api.productSubscriptions.getActiveProducts,
      { organizationId },
    );

    expect(products).toEqual([]);
  });

  test("active subscription grants access", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    // Create an active subscription for CRM
    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId,
        productId: "crm",
        status: "active",
        cancelAtPeriodEnd: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const products = await t.withIdentity(identity).query(
      api.productSubscriptions.getActiveProducts,
      { organizationId },
    );

    expect(products).toContain("crm");
    expect(products).not.toContain("gabinet");
  });

  test("trialing subscription grants access", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId,
        productId: "gabinet",
        status: "trialing",
        cancelAtPeriodEnd: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const products = await t.withIdentity(identity).query(
      api.productSubscriptions.getActiveProducts,
      { organizationId },
    );

    expect(products).toContain("gabinet");
  });

  test("canceled subscription does not grant access", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId,
        productId: "crm",
        status: "canceled",
        cancelAtPeriodEnd: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const products = await t.withIdentity(identity).query(
      api.productSubscriptions.getActiveProducts,
      { organizationId },
    );

    expect(products).not.toContain("crm");
  });

  test("past_due subscription does not grant access", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId,
        productId: "crm",
        status: "past_due",
        cancelAtPeriodEnd: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const products = await t.withIdentity(identity).query(
      api.productSubscriptions.getActiveProducts,
      { organizationId },
    );

    expect(products).not.toContain("crm");
  });
});

describe("verifyProductAccess", () => {
  test("throws when org has no subscriptions at all (no grace period)", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    await expect(
      t.run(async (ctx) => {
        await verifyProductAccess(ctx, organizationId, "gabinet");
      }),
    ).rejects.toThrow("No active subscription for product: gabinet");
  });

  test("throws when other orgs have subscriptions but this org does not", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    // Seed a subscription for a different org
    await t.run(async (ctx) => {
      const otherUserId = await ctx.db.insert("users", {
        name: "Other User",
        email: "other@example.com",
      });
      const otherOrgId = await ctx.db.insert("organizations", {
        name: "Other Org",
        slug: "other-org",
        ownerId: otherUserId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("productSubscriptions", {
        organizationId: otherOrgId,
        productId: "gabinet",
        status: "active",
        cancelAtPeriodEnd: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.run(async (ctx) => {
        await verifyProductAccess(ctx, organizationId, "gabinet");
      }),
    ).rejects.toThrow("No active subscription for product: gabinet");
  });

  test("allows access for active subscription", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId,
        productId: "gabinet",
        status: "active",
        cancelAtPeriodEnd: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.run(async (ctx) => {
        await verifyProductAccess(ctx, organizationId, "gabinet");
      }),
    ).resolves.toBeUndefined();
  });

  test("allows access for trialing subscription", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId,
        productId: "gabinet",
        status: "trialing",
        cancelAtPeriodEnd: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.run(async (ctx) => {
        await verifyProductAccess(ctx, organizationId, "gabinet");
      }),
    ).resolves.toBeUndefined();
  });

  test("throws for canceled subscription", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId,
        productId: "gabinet",
        status: "canceled",
        cancelAtPeriodEnd: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.run(async (ctx) => {
        await verifyProductAccess(ctx, organizationId, "gabinet");
      }),
    ).rejects.toThrow("Subscription for gabinet is canceled");
  });
});
